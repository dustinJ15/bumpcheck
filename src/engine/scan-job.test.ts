/**
 * One run of the scan job, against the fakes: continuing across runs, and
 * the retry rule (one retry, then failed, old results kept).
 */

import { describe, expect, it } from 'vitest'
import { LIMITS, SCAN_PACING } from '../config'
import { selectDueProjects } from '../core/schedule'
import { buildFakeWorld, FAKE_OWNER } from '../services/fake-world'
import { FakeClock, MemoryRecordStore } from '../services/fakes'
import type { PackageRegistry } from '../services/types'
import { noAlerts, type ScanServices } from './scan'
import { runScanJobRun, startScanCheckpoint, type ScanCheckpoint, type ScanJobRun } from './scan-job'

const PROJECT = 'project-1'

/** The fake world, with a registry that throws for the first `failures` calls. */
function world(options: { failures?: number } = {}) {
  const fakes = buildFakeWorld()
  let failuresLeft = options.failures ?? 0
  const registry: PackageRegistry = {
    getPackage: async (name) => {
      if (failuresLeft > 0) {
        failuresLeft--
        throw new Error('npm registry answered 503')
      }
      return fakes.registry.getPackage(name)
    },
  }
  const store = new MemoryRecordStore()
  const clock = new FakeClock()
  store.seedProject({
    id: PROJECT,
    userId: 'user-1',
    repoOwner: FAKE_OWNER,
    repoName: 'demo',
    lastOpenedAt: new Date(clock.now()).toISOString(),
  })
  const services: ScanServices = { ...fakes, registry, store, clock, alertHook: noAlerts }
  return { services, store, clock }
}

/** Runs the job to its end the way the job room would, saving the checkpoint as JSON between runs. */
async function runToEnd(services: ScanServices, maxRuns = 50) {
  let checkpoint: ScanCheckpoint = startScanCheckpoint(PROJECT, false)
  const runs: ScanJobRun[] = []
  for (let attempt = 1; attempt <= maxRuns; attempt++) {
    const run = await runScanJobRun(services, checkpoint, { mayRunAgain: attempt < maxRuns })
    runs.push(run)
    if (run.next === 'finish') return { runs, last: run }
    checkpoint = JSON.parse(JSON.stringify(run.checkpoint))
  }
  throw new Error('the job never finished')
}

describe('runScanJobRun', () => {
  it('finishes a scan and reports its outcome', async () => {
    const { services, store } = world()
    const { runs, last } = await runToEnd(services)

    expect(runs).toHaveLength(1)
    expect(last).toMatchObject({ next: 'finish', outcome: 'succeeded', reason: null })
    expect(store.projects.get(PROJECT)?.scanStatus).toBe('done')
  })

  it('ends as failed, without retrying, when the repo itself is the problem', async () => {
    const { services, store } = world()
    store.seedProject({ id: PROJECT, userId: 'user-1', repoOwner: FAKE_OWNER, repoName: 'no-manifest' })
    const { runs, last } = await runToEnd(services)

    expect(runs).toHaveLength(1)
    expect(last).toMatchObject({ outcome: 'failed', reason: 'The repository has no package.json at its root.' })
  })

  it('retries once after a failed tick, from the last step that completed, and then succeeds', async () => {
    const { services, store } = world({ failures: 1 })
    const first = await runScanJobRun(services, startScanCheckpoint(PROJECT, false), { mayRunAgain: true })

    expect(first).toMatchObject({ next: 'continue', afterMs: SCAN_PACING.retryDelayMs })
    if (first.next !== 'continue') throw new Error('expected a retry')
    expect(first.checkpoint.failedTicks).toBe(1)
    // The manifest was read before the failure; the retry does not read it again.
    expect(first.checkpoint.scan.step).toBe('look-up')
    expect(store.projects.get(PROJECT)?.scanStatus).toBe('scanning')

    const second = await runScanJobRun(services, first.checkpoint, { mayRunAgain: true })
    expect(second).toMatchObject({ next: 'finish', outcome: 'succeeded' })
    expect(store.projects.get(PROJECT)?.scanStatus).toBe('done')
  })

  it('marks the scan failed after the second failed tick, and keeps the old results', async () => {
    const { services, store } = world()
    await runToEnd(services)
    const before = store.projects.get(PROJECT)
    expect(before?.dependencies).toHaveLength(10)

    // A later scan of the same project, with the registry down.
    const down = world({ failures: 1000 })
    down.store.projects.set(PROJECT, structuredClone(before!))
    const { runs, last } = await runToEnd(down.services)

    expect(runs).toHaveLength(SCAN_PACING.failedTicksPerScan)
    expect(last).toMatchObject({ outcome: 'failed', reason: 'The scan could not finish. Try again later.' })
    const after = down.store.projects.get(PROJECT)
    expect(after?.scanStatus).toBe('failed')
    expect(after?.scanError).toBe('The scan could not finish. Try again later.')
    expect(after?.dependencies).toEqual(before?.dependencies)
  })

  it('retries a failed scan once, then marks it failed with every old verdict intact, and records the attempt', async () => {
    const { services, store, clock } = world()
    await runToEnd(services)
    const before = structuredClone(store.projects.get(PROJECT)!)
    const verdictsBefore = structuredClone([...store.verdicts.entries()])
    expect(verdictsBefore.length).toBeGreaterThan(3)

    // The next day's scan, with the registry down the whole time.
    clock.advance(LIMITS.rescanIntervalMs)
    const down = world({ failures: 1000 })
    const failing: ScanServices = { ...down.services, store, clock }
    const { runs, last } = await runToEnd(failing)

    // Exactly one retry: the first failed tick asks to run again, the second ends the scan.
    expect(runs.map((run) => run.next)).toEqual(['continue', 'finish'])
    expect(runs[0]).toMatchObject({ afterMs: SCAN_PACING.retryDelayMs })
    expect(last).toMatchObject({ outcome: 'failed', reason: 'The scan could not finish. Try again later.' })

    const after = store.projects.get(PROJECT)!
    expect(after).toMatchObject({ scanStatus: 'failed', scanError: 'The scan could not finish. Try again later.' })
    // The report and the shared verdicts are exactly what the last good scan left.
    expect(after.dependencies).toEqual(before.dependencies)
    expect([...store.verdicts.entries()]).toEqual(verdictsBefore)
    expect(after.lastScanAt).toBe(before.lastScanAt)
    // The failed attempt counts as today's scan: due again a day later, not at the next hourly run.
    expect(after.nextDueAt).toBe(new Date(clock.now() + LIMITS.rescanIntervalMs).toISOString())
    expect(selectDueProjects([after], clock.now() + 60 * 60 * 1000)).toEqual([])
    expect(selectDueProjects([after], clock.now() + LIMITS.rescanIntervalMs)).toEqual([PROJECT])
  })

  it('counts failed ticks across the whole scan: with its one retry used, the next failure is final', async () => {
    const down = world({ failures: 1000 })
    const retryUsed: ScanCheckpoint = { ...startScanCheckpoint(PROJECT, false), failedTicks: 1 }
    const run = await runScanJobRun(down.services, retryUsed, { mayRunAgain: true })
    expect(run).toMatchObject({ next: 'finish', outcome: 'failed' })
  })

  it('does not ask for another run when the job room allows no more', async () => {
    const down = world({ failures: 1 })
    const run = await runScanJobRun(down.services, startScanCheckpoint(PROJECT, false), { mayRunAgain: false })
    expect(run).toMatchObject({ next: 'finish', outcome: 'failed' })
    expect(down.store.projects.get(PROJECT)?.scanStatus).toBe('failed')
  })

  it('marks the scan cancelled when the job is cancelled', async () => {
    const { services, store } = world()
    const run = await runScanJobRun(services, startScanCheckpoint(PROJECT, false), {
      mayRunAgain: true,
      isCancelled: () => true,
    })
    expect(run).toMatchObject({ next: 'finish', outcome: 'cancelled', reason: 'The scan was cancelled.' })
    expect(store.projects.get(PROJECT)).toMatchObject({ scanStatus: 'failed', scanError: 'The scan was cancelled.' })
  })
})
