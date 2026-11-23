/**
 * Engine tests for on-demand scans: "check this one" and retrying a failed
 * verdict. In memory, against the fakes. No network, no AI.
 *
 * The rule under test: an on-demand scan judges only the dependencies named
 * in the project's `checkRequests`, and those go through the same per-scan
 * cap and daily ceiling as a full scan.
 */

import { describe, expect, it } from 'vitest'
import { LIMITS } from '../config'
import { utcDay } from '../core/limits'
import type { DependencyResult, Verdict } from '../core/model'
import { FakeClock, FakeJudge, FakeRegistry, FakeSourceHost, MemoryRecordStore, type FakeJudgeResponder } from '../services/fakes'
import type { RegistryPackage } from '../services/types'
import { runScan, startScan, type ScanServices } from './scan'
import { runScanJobRun, startScanCheckpoint } from './scan-job'

const PROJECT = 'project-1'

/** A package on the fake registry whose source is github.com/acme/<name>. */
function pkg(name: string, latest: string): [string, RegistryPackage] {
  return [name, { latest, versions: [latest], source: { owner: 'acme', repo: name } }]
}

function changelogFor(...versions: string[]): string {
  return versions.map((v) => `## ${v}\n- notes for ${v}`).join('\n\n')
}

/**
 * One project: `express` is a major behind, `zod` and `chalk` a minor,
 * `ms` a patch, `current` is up to date and `local` cannot be checked. Every
 * package has a changelog.
 */
function world(options: { respond?: FakeJudgeResponder; extraMinors?: number } = {}) {
  const dependencies: Record<string, string> = {
    express: '^4.17.1',
    zod: '^3.22.0',
    chalk: '^5.3.0',
    ms: '^2.1.0',
    current: '^1.0.0',
    local: 'file:../local',
  }
  const packages = [
    pkg('express', '5.1.0'),
    pkg('zod', '3.23.8'),
    pkg('chalk', '5.4.1'),
    pkg('ms', '2.1.3'),
    pkg('current', '1.0.0'),
  ]
  const changelogs: Record<string, string> = {
    'acme/express': changelogFor('5.1.0', '5.0.0'),
    'acme/zod': changelogFor('3.23.8', '3.23.0'),
    'acme/chalk': changelogFor('5.4.1', '5.4.0'),
    'acme/ms': changelogFor('2.1.3', '2.1.1'),
    'acme/current': changelogFor('1.0.0'),
  }
  for (let i = 0; i < (options.extraMinors ?? 0); i++) {
    dependencies[`minor-${i}`] = '^1.0.0'
    packages.push(pkg(`minor-${i}`, '1.1.0'))
    changelogs[`acme/minor-${i}`] = changelogFor('1.1.0')
  }

  const registry = new FakeRegistry(Object.fromEntries(packages))
  const sourceHost = new FakeSourceHost({
    repos: { 'dustin/app': { defaultBranch: 'main', files: { 'package.json': JSON.stringify({ dependencies }) } } },
    changelogs,
  })
  const judge = new FakeJudge(options.respond)
  const store = new MemoryRecordStore()
  const clock = new FakeClock()
  const alerts: string[] = []
  store.seedProject({ id: PROJECT, userId: 'user-1', repoOwner: 'dustin', repoName: 'app' })

  const services: ScanServices = {
    registry,
    sourceHost,
    judge,
    store,
    clock,
    alertHook: async ({ projectId }) => {
      alerts.push(projectId)
    },
  }
  return { services, registry, sourceHost, judge, store, clock, alerts }
}

type World = ReturnType<typeof world>

function project(w: World) {
  const p = w.store.projects.get(PROJECT)
  if (!p) throw new Error('project missing')
  return p
}

function dep(w: World, name: string): DependencyResult {
  const d = project(w).dependencies.find((x) => x.name === name)
  if (!d) throw new Error(`no dependency ${name}`)
  return d
}

/** Runs the first, full scan, then forgets the calls it made. */
async function scanned(w: World): Promise<World> {
  await runScan(w.services, startScan(PROJECT))
  w.registry.calls.length = 0
  w.sourceHost.calls.length = 0
  w.judge.calls.length = 0
  w.alerts.length = 0
  return w
}

/** What the server action does before it enqueues an on-demand job. */
function request(w: World, ...names: string[]) {
  w.store.projects.set(PROJECT, { ...project(w), scanStatus: 'queued', checkRequests: names })
}

function failedVerdict(key: string, packageName: string): Verdict {
  return {
    key,
    packageName,
    status: 'failed',
    changes: [],
    sourceUrl: 'https://example.test/CHANGELOG.md',
    inputTruncated: false,
    fromVersion: '3.22.0',
    toVersion: '3.23.8',
    failureReason: 'response is not valid JSON',
    decidedAt: '2026-11-01T00:00:00.000Z',
  }
}

describe('an on-demand scan ("check this one")', () => {
  it('judges only the requested dependency and reads nothing from the repo', async () => {
    const w = await scanned(world())
    const before = structuredClone(project(w))
    request(w, 'zod')

    const end = await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(end.outcome).toBe('succeeded')
    // One judge call, for zod. Not for chalk or ms (also unread), not for express (already read).
    expect(w.judge.calls.map((c) => c.packageName)).toEqual(['zod'])
    expect(w.judge.calls[0]).toMatchObject({ fromVersion: '3.22.0', toVersion: '3.23.8' })
    // The only outside calls are for zod: where its source is, and its changelog.
    expect(w.registry.calls).toEqual(['zod'])
    expect(w.sourceHost.calls).toEqual([{ method: 'getChangelog', source: 'acme/zod' }])

    expect(dep(w, 'zod').verdictKey).toBe('zod@3->3.23')
    expect(w.store.verdicts.get('zod@3->3.23')).toMatchObject({ status: 'ready', packageName: 'zod' })
    // Every other dependency is exactly as the full scan left it.
    for (const name of ['express', 'chalk', 'ms']) {
      expect(dep(w, name)).toEqual(before.dependencies.find((d) => d.name === name))
    }
  })

  it('ends as "done", clears the request, and leaves the scan times and report alone', async () => {
    const w = await scanned(world())
    const before = structuredClone(project(w))
    w.clock.advance(60 * 60 * 1000)
    request(w, 'zod')

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    const after = project(w)
    expect(after.scanStatus).toBe('done')
    expect(after.scanProgress).toBeNull()
    expect(after.checkRequests).toEqual([])
    expect(after.lastScanAt).toBe(before.lastScanAt)
    expect(after.nextDueAt).toBe(before.nextDueAt)
    expect(after.scanReport).toEqual(before.scanReport)
  })

  it('counts its AI call against the daily total and never alerts', async () => {
    const w = await scanned(world())
    const day = utcDay(w.clock.now())
    const callsBefore = w.store.aiCalls.get(day) ?? 0
    request(w, 'ms')

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(w.store.aiCalls.get(day)).toBe(callsBefore + 1)
    expect(w.alerts).toEqual([])
  })

  it('makes no AI call when the daily ceiling is reached, and says so on the dependency', async () => {
    const w = await scanned(world())
    w.store.aiCalls.set(utcDay(w.clock.now()), LIMITS.aiCallsPerDay)
    request(w, 'zod')

    const end = await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(end.outcome).toBe('succeeded')
    expect(w.judge.calls).toEqual([])
    expect(dep(w, 'zod').verdictKey).toBeUndefined()
    expect(dep(w, 'zod').deferredBy).toBe('daily-ceiling')
    expect(project(w).scanStatus).toBe('done')
    expect(project(w).checkRequests).toEqual([])
  })

  it('stops at the per-scan cap even if more were requested', async () => {
    const extra = LIMITS.newVerdictsPerScan + 1
    const w = await scanned(world({ extraMinors: extra }))
    const names = Array.from({ length: extra }, (_, i) => `minor-${i}`)
    request(w, ...names)

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(w.judge.calls).toHaveLength(LIMITS.newVerdictsPerScan)
    const last = dep(w, names[names.length - 1])
    expect(last.verdictKey).toBeUndefined()
    expect(last.deferredBy).toBe('scan-cap')
  })

  it('attaches a verdict already in the shared cache without an AI call', async () => {
    const w = await scanned(world())
    w.store.verdicts.set('zod@3->3.23', { ...failedVerdict('zod@3->3.23', 'zod'), status: 'ready', label: 'safe', summary: 'ok' })
    request(w, 'zod')

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(w.judge.calls).toEqual([])
    expect(w.registry.calls).toEqual([])
    expect(dep(w, 'zod').verdictKey).toBe('zod@3->3.23')
  })

  it('ignores a requested name that is not a checkable dependency of the project', async () => {
    const w = await scanned(world())
    // Not a dependency at all, up to date (nothing to read), and not checked (no versions).
    request(w, 'left-pad', 'constructor', 'current', 'local')

    const end = await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(end.outcome).toBe('succeeded')
    expect(w.judge.calls).toEqual([])
    expect(w.registry.calls).toEqual([])
    expect(project(w).scanStatus).toBe('done')
  })

  it('judges nothing when no request was recorded', async () => {
    const w = await scanned(world())

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(w.judge.calls).toEqual([])
    expect(w.registry.calls).toEqual([])
    expect(w.sourceHost.calls).toEqual([])
  })
})

describe('retrying a failed verdict', () => {
  /** A scanned project whose zod verdict is a stored failure. */
  async function withFailedZod(respond?: FakeJudgeResponder) {
    const w = await scanned(world({ respond }))
    w.store.verdicts.set('zod@3->3.23', failedVerdict('zod@3->3.23', 'zod'))
    const p = project(w)
    w.store.projects.set(PROJECT, {
      ...p,
      dependencies: p.dependencies.map((d) => (d.name === 'zod' ? { ...d, verdictKey: 'zod@3->3.23' } : d)),
    })
    return w
  }

  it('asks the judge again and replaces the failed verdict', async () => {
    const w = await withFailedZod()
    const day = utcDay(w.clock.now())
    const callsBefore = w.store.aiCalls.get(day) ?? 0
    request(w, 'zod')

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(w.judge.calls.map((c) => c.packageName)).toEqual(['zod'])
    const verdict = w.store.verdicts.get('zod@3->3.23')
    expect(verdict).toMatchObject({ status: 'ready', label: 'breaking' })
    expect(verdict?.failureReason).toBeUndefined()
    expect(w.store.aiCalls.get(day)).toBe(callsBefore + 1)
  })

  it('stores a failure again when the judge still cannot answer', async () => {
    const w = await withFailedZod(() => 'not a verdict')
    w.clock.advance(60 * 1000)
    request(w, 'zod')

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    // One try and one retry, as in a full scan.
    expect(w.judge.calls).toHaveLength(2)
    const verdict = w.store.verdicts.get('zod@3->3.23')
    expect(verdict?.status).toBe('failed')
    expect(verdict?.decidedAt).toBe(new Date(w.clock.now()).toISOString())
  })

  it('makes no AI call when the daily ceiling is reached, and keeps the failed verdict', async () => {
    const w = await withFailedZod()
    w.store.aiCalls.set(utcDay(w.clock.now()), LIMITS.aiCallsPerDay)
    request(w, 'zod')

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(w.judge.calls).toEqual([])
    expect(w.store.verdicts.get('zod@3->3.23')?.status).toBe('failed')
    expect(dep(w, 'zod')).toMatchObject({ verdictKey: 'zod@3->3.23', deferredBy: 'daily-ceiling' })
  })
})

describe('a cached verdict for a minor or patch upgrade', () => {
  /** A stored zod verdict that was read from `fromVersion`. The project is on zod 3.22.0. */
  function zodVerdict(fromVersion: string): Verdict {
    return { ...failedVerdict('zod@3->3.23', 'zod'), status: 'ready', label: 'safe', summary: 'ok', failureReason: undefined, fromVersion }
  }

  it('is not attached by a scan when it was read from a later version than the project is on', async () => {
    const w = world()
    w.store.verdicts.set('zod@3->3.23', zodVerdict('3.22.5'))

    await runScan(w.services, startScan(PROJECT))

    // The verdict skipped 3.22.1 to 3.22.5, which this project would cross: still "not read".
    expect(dep(w, 'zod').verdictKey).toBeUndefined()
    // And a scan never pays to read a minor on its own.
    expect(w.judge.calls.map((c) => c.packageName)).toEqual(['express'])
  })

  it('is attached by a scan when it was read from the same or an earlier version', async () => {
    for (const fromVersion of ['3.22.0', '3.21.4']) {
      const w = world()
      w.store.verdicts.set('zod@3->3.23', zodVerdict(fromVersion))
      await runScan(w.services, startScan(PROJECT))
      expect(dep(w, 'zod').verdictKey, fromVersion).toBe('zod@3->3.23')
    }
  })

  it('is read again, from the wider range, when the project asks, and the wider verdict replaces it', async () => {
    const w = world()
    w.store.verdicts.set('zod@3->3.23', zodVerdict('3.22.5'))
    await scanned(w)
    const day = utcDay(w.clock.now())
    const callsBefore = w.store.aiCalls.get(day) ?? 0
    request(w, 'zod')

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(w.judge.calls).toHaveLength(1)
    expect(w.judge.calls[0]).toMatchObject({ packageName: 'zod', fromVersion: '3.22.0', toVersion: '3.23.8' })
    expect(w.store.verdicts.get('zod@3->3.23')).toMatchObject({ status: 'ready', fromVersion: '3.22.0' })
    expect(dep(w, 'zod').verdictKey).toBe('zod@3->3.23')
    // The wider read is an AI call like any other.
    expect(w.store.aiCalls.get(day)).toBe(callsBefore + 1)
  })

  it('is not read again past the daily ceiling: the narrower verdict stays and the dependency stays unread', async () => {
    const w = world()
    w.store.verdicts.set('zod@3->3.23', zodVerdict('3.22.5'))
    await scanned(w)
    w.store.aiCalls.set(utcDay(w.clock.now()), LIMITS.aiCallsPerDay)
    request(w, 'zod')

    await runScan(w.services, startScan(PROJECT, { onDemand: true }))

    expect(w.judge.calls).toEqual([])
    expect(w.store.verdicts.get('zod@3->3.23')?.fromVersion).toBe('3.22.5')
    expect(dep(w, 'zod')).toMatchObject({ deferredBy: 'daily-ceiling' })
    expect(dep(w, 'zod').verdictKey).toBeUndefined()
  })

  it('does not change majors: a major shares its verdict whatever version it was read from', async () => {
    const w = world()
    // The project is on express 4.17.1; this verdict was read from 4.18.0.
    w.store.verdicts.set('express@4->5.1', { ...zodVerdict('4.18.0'), key: 'express@4->5.1', packageName: 'express' })

    await runScan(w.services, startScan(PROJECT))

    expect(dep(w, 'express').verdictKey).toBe('express@4->5.1')
    expect(w.judge.calls).toEqual([])
  })
})

describe('an on-demand job that cannot finish', () => {
  /** Runs the on-demand job the way the job room would, until it finishes. */
  async function runJob(services: ScanServices, isCancelled?: () => boolean) {
    let checkpoint = startScanCheckpoint(PROJECT, true)
    for (let run = 1; run <= 5; run++) {
      const result = await runScanJobRun(services, checkpoint, { mayRunAgain: true, isCancelled })
      if (result.next === 'finish') return result
      checkpoint = result.checkpoint
    }
    throw new Error('the job never finished')
  }

  function withRegistryDown(w: World): ScanServices {
    return {
      ...w.services,
      registry: {
        getPackage: async () => {
          throw new Error('npm registry answered 503')
        },
      },
    }
  }

  it('leaves the project "done" with its results, drops the request, and says the check failed', async () => {
    const w = await scanned(world())
    const before = structuredClone(project(w))
    request(w, 'zod')

    const result = await runJob(withRegistryDown(w))

    expect(result).toMatchObject({ outcome: 'failed', reason: 'The check could not finish. Try again later.' })
    const after = project(w)
    // The last full scan is still the project's state: a failed check does not make it a failed scan.
    expect(after.scanStatus).toBe('done')
    expect(after.scanError).toBe('The check could not finish. Try again later.')
    expect(after.scanProgress).toBeNull()
    expect(after.checkRequests).toEqual([])
    expect(after.dependencies).toEqual(before.dependencies)
    expect(after.lastScanAt).toBe(before.lastScanAt)
    expect(w.judge.calls).toEqual([])
  })

  it('can be asked again afterwards, and a check that works clears the notice', async () => {
    const w = await scanned(world())
    request(w, 'zod')
    await runJob(withRegistryDown(w))

    request(w, 'zod')
    const result = await runJob(w.services)

    expect(result.outcome).toBe('succeeded')
    expect(project(w)).toMatchObject({ scanStatus: 'done', scanError: null })
    expect(dep(w, 'zod').verdictKey).toBe('zod@3->3.23')
  })

  it('is treated the same way when it is cancelled', async () => {
    const w = await scanned(world())
    request(w, 'zod')

    const result = await runJob(w.services, () => true)

    expect(result).toMatchObject({ outcome: 'cancelled', reason: 'The check was cancelled.' })
    expect(project(w)).toMatchObject({ scanStatus: 'done', scanError: 'The check was cancelled.', checkRequests: [] })
    expect(w.judge.calls).toEqual([])
  })

  it('does not change how a failed full scan is recorded', async () => {
    const w = await scanned(world())
    let checkpoint = startScanCheckpoint(PROJECT, false)
    for (let run = 1; run <= 5; run++) {
      const result = await runScanJobRun(withRegistryDown(w), checkpoint, { mayRunAgain: true })
      if (result.next === 'finish') break
      checkpoint = result.checkpoint
    }
    expect(project(w)).toMatchObject({ scanStatus: 'failed', scanError: 'The scan could not finish. Try again later.' })
  })
})
