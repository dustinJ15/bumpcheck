/**
 * One job tick: the scan stops when the tick's outbound-call budget is used,
 * and the saved state finishes the scan on a later tick. Also runs the fake
 * world the local test server uses, so its data is known to produce each
 * state a scan can end in.
 */

import { describe, expect, it } from 'vitest'
import { buildFakeWorld, FAKE_JUDGE_DELAY_MS, FAKE_OWNER, FAKE_PACKAGE_NAMES } from '../services/fake-world'
import { FakeClock, MemoryRecordStore } from '../services/fakes'
import type { RecordStore } from '../services/types'
import { noAlerts, startScan, type ScanServices, type ScanState } from './scan'
import { runScanTick } from './tick'

const PROJECT = 'project-1'

function demoWorld() {
  const store = new MemoryRecordStore()
  store.seedProject({ id: PROJECT, userId: 'user-1', repoOwner: FAKE_OWNER, repoName: 'demo' })
  const services: ScanServices = { ...buildFakeWorld({ sleep: async () => {} }), store, clock: new FakeClock(), alertHook: noAlerts }
  return { services, store }
}

describe('runScanTick', () => {
  it('finishes a small scan in one tick and reports the calls it made', async () => {
    const { services, store } = demoWorld()
    const tick = await runScanTick(services, startScan(PROJECT), { outboundCallBudget: 1000 })

    expect(tick.stopped).toBe('done')
    expect(tick.state.outcome).toBe('succeeded')
    // 2 to read the manifest, 9 registry lookups, changelog and release reads, and the judge calls.
    expect(tick.outboundCalls).toBeGreaterThan(8)
    expect(store.projects.get(PROJECT)?.scanStatus).toBe('done')
  })

  it('stops when the budget is used, and the saved state finishes on later ticks', async () => {
    const { services, store } = demoWorld()

    const first = await runScanTick(services, startScan(PROJECT), { outboundCallBudget: 3 })
    expect(first.stopped).toBe('budget')
    expect(first.state.step).not.toBe('done')
    expect(store.projects.get(PROJECT)?.scanStatus).toBe('scanning')

    // The state must survive being saved between ticks as JSON.
    let state: ScanState = JSON.parse(JSON.stringify(first.state))
    let ticks = 1
    while (state.step !== 'done') {
      const next = await runScanTick(services, state, { outboundCallBudget: 3 })
      state = JSON.parse(JSON.stringify(next.state))
      ticks++
      if (ticks > 50) throw new Error('the scan never finished')
    }
    expect(ticks).toBeGreaterThan(2)
    expect(state.outcome).toBe('succeeded')
    expect(store.projects.get(PROJECT)?.scanStatus).toBe('done')
  })

  it('overshoots the budget by at most one step', async () => {
    const { services } = demoWorld()
    // read-manifest makes 2 calls; the look-up step then makes 9 in one go
    // (the demo repo's nine registry packages).
    const tick = await runScanTick(services, startScan(PROJECT), { outboundCallBudget: 3 })
    expect(tick.outboundCalls).toBe(11)
  })

  it('stops without running a step when cancelled', async () => {
    const { services, store } = demoWorld()
    const start = startScan(PROJECT)
    const tick = await runScanTick(services, start, { outboundCallBudget: 1000, isCancelled: () => true })
    expect(tick).toEqual({ state: start, stopped: 'cancelled', outboundCalls: 0 })
    expect(store.projects.get(PROJECT)?.scanStatus).toBe('queued')
  })

  it('ignores a cancel that arrives after the results are written', async () => {
    const { services, store } = demoWorld()
    let cancelled = false
    // A store that "cancels the job" at the moment the results are written.
    const watchedStore: RecordStore = {
      getProject: (id) => store.getProject(id),
      updateProject: async (id, changes) => {
        await store.updateProject(id, changes)
        if (changes.scanStatus === 'done') cancelled = true
      },
      getVerdict: (key) => store.getVerdict(key),
      putVerdict: (verdict) => store.putVerdict(verdict),
      getAiCalls: (day) => store.getAiCalls(day),
      addAiCall: (day) => store.addAiCall(day),
    }
    const watching: ScanServices = { ...services, store: watchedStore }
    const tick = await runScanTick(watching, startScan(PROJECT), { outboundCallBudget: 1000, isCancelled: () => cancelled })
    expect(tick.stopped).toBe('done')
    expect(store.projects.get(PROJECT)?.scanStatus).toBe('done')
  })

  it('does not throw when a step fails: it stops with the last good state and the error', async () => {
    const { services } = demoWorld()
    const broken: ScanServices = {
      ...services,
      registry: {
        getPackage: async () => {
          throw new Error('registry down')
        },
      },
    }
    const tick = await runScanTick(broken, startScan(PROJECT), { outboundCallBudget: 1000 })
    expect(tick).toMatchObject({ stopped: 'error', error: 'registry down' })
    expect(tick.state.step).toBe('look-up')
  })
})

describe('the fake world behind the local test server', () => {
  it('gives the demo repo one dependency in each state', async () => {
    const { services, store } = demoWorld()
    await runScanTick(services, startScan(PROJECT), { outboundCallBudget: 1000 })

    const project = store.projects.get(PROJECT)
    const byName = Object.fromEntries((project?.dependencies ?? []).map((d) => [d.name.replace(`@${FAKE_OWNER}/`, ''), d]))
    expect(Object.keys(byName)).toHaveLength(10)

    expect(byName['router']).toMatchObject({ group: 'runtime', triage: 'major', current: '4.18.0', target: '5.1.0' })
    expect(byName['dates']).toMatchObject({ triage: 'major' })
    expect(byName['colors']).toMatchObject({ triage: 'minor' })
    expect(byName['tiny']).toMatchObject({ triage: 'up-to-date' })
    expect(byName['local-thing']).toMatchObject({ triage: 'not-checked', notCheckedReason: 'local' })
    expect(byName['test-runner']).toMatchObject({ group: 'dev', triage: 'major' })
    expect(byName['types']).toMatchObject({ group: 'dev', triage: 'major', current: '0.4.0', target: '0.5.2' })

    const verdict = (name: string) => store.verdicts.get(byName[name].verdictKey ?? '')
    expect(verdict('router')).toMatchObject({ status: 'ready', label: 'breaking' })
    expect(verdict('router')?.changes).toHaveLength(2)
    expect(verdict('dates')).toMatchObject({ status: 'no-changelog' })
    expect(verdict('test-runner')).toMatchObject({ status: 'ready', label: 'safe' })
    expect(verdict('types')).toMatchObject({ status: 'ready', label: 'unclear' })
    expect(byName['types'].verdictKey).toBe(`@${FAKE_OWNER}/types@0.4->0.5`)

    // The states ticket 03's page must be able to show.
    expect(byName['big']).toMatchObject({ group: 'runtime', triage: 'major' })
    expect(verdict('big')).toMatchObject({ status: 'ready', label: 'breaking', inputTruncated: true })
    expect(byName['garbled']).toMatchObject({ group: 'dev', triage: 'major' })
    expect(verdict('garbled')).toMatchObject({ status: 'failed' })
    expect(verdict('garbled')?.failureReason).toBeTruthy()
    expect(byName['lint']).toMatchObject({ group: 'dev', triage: 'patch' })
    // Minor and patch upgrades are not read by a scan.
    expect(byName['colors'].verdictKey).toBeUndefined()
    expect(byName['lint'].verdictKey).toBeUndefined()

    expect(project?.scanReport).toEqual({ judged: 5, deferredByScanCap: 0, deferredByDailyCeiling: 0 })
  })

  it('answers an on-demand check of the demo repo\'s minor upgrade with a safe verdict', async () => {
    const { services, store } = demoWorld()
    await runScanTick(services, startScan(PROJECT), { outboundCallBudget: 1000 })
    const scanned = store.projects.get(PROJECT)!
    store.projects.set(PROJECT, { ...scanned, checkRequests: [`@${FAKE_OWNER}/colors`] })

    await runScanTick(services, startScan(PROJECT, { onDemand: true }), { outboundCallBudget: 1000 })

    const colors = store.projects.get(PROJECT)?.dependencies.find((d) => d.name === `@${FAKE_OWNER}/colors`)
    expect(store.verdicts.get(colors?.verdictKey ?? '')).toMatchObject({ status: 'ready', label: 'safe' })
  })

  it('has a repo whose scan takes long enough to be watched, and one with no dependencies', async () => {
    const { sourceHost } = buildFakeWorld()
    const slow = JSON.parse((await sourceHost.getFile({ owner: FAKE_OWNER, repo: 'slow' }, 'package.json', 'main')) ?? '{}')
    expect(Object.keys(slow.dependencies ?? {})).toHaveLength(3)
    for (const name of Object.keys(slow.dependencies ?? {})) expect(FAKE_JUDGE_DELAY_MS[name]).toBeGreaterThan(0)

    const empty = JSON.parse((await sourceHost.getFile({ owner: FAKE_OWNER, repo: 'empty' }, 'package.json', 'main')) ?? 'null')
    expect(empty).toEqual({ name: 'empty' })
  })

  it('has a repo on an older version of a demo package, and one whose changelog cannot be fetched', async () => {
    const { sourceHost } = buildFakeWorld()
    const older = JSON.parse((await sourceHost.getFile({ owner: FAKE_OWNER, repo: 'older' }, 'package.json', 'main')) ?? '{}')
    expect(older.dependencies).toEqual({ [`@${FAKE_OWNER}/colors`]: '^5.1.0' })

    const offline = JSON.parse((await sourceHost.getFile({ owner: FAKE_OWNER, repo: 'offline' }, 'package.json', 'main')) ?? '{}')
    expect(offline.dependencies).toEqual({ [`@${FAKE_OWNER}/unreachable`]: '^1.0.0' })
    await expect(sourceHost.getChangelog({ owner: FAKE_OWNER, repo: 'unreachable' })).rejects.toThrow('GitHub')
    // A full scan never fetches a minor upgrade's changelog, so the repo itself scans fine.
    const store = new MemoryRecordStore()
    store.seedProject({ id: PROJECT, userId: 'user-1', repoOwner: FAKE_OWNER, repoName: 'offline' })
    const services: ScanServices = { ...buildFakeWorld(), store, clock: new FakeClock(), alertHook: noAlerts }
    const tick = await runScanTick(services, startScan(PROJECT), { outboundCallBudget: 1000 })
    expect(tick.stopped).toBe('done')
    expect(store.projects.get(PROJECT)?.dependencies[0]).toMatchObject({ triage: 'minor' })
  })

  it('lists every fake package, so the test reset can clear their verdicts', () => {
    expect(FAKE_PACKAGE_NAMES).toContain(`@${FAKE_OWNER}/router`)
    expect(FAKE_PACKAGE_NAMES).toContain(`@${FAKE_OWNER}/slow-a`)
    expect(FAKE_PACKAGE_NAMES.every((name) => name.startsWith(`@${FAKE_OWNER}/`))).toBe(true)
  })

  it('has enough good repos to reach the project limit, and repos the check refuses', async () => {
    const { sourceHost } = buildFakeWorld()
    for (const name of ['demo', 'second', 'third', 'fourth']) {
      expect(await sourceHost.getFile({ owner: FAKE_OWNER, repo: name }, 'package.json', 'main')).not.toBeNull()
    }
    expect(await sourceHost.getRepo({ owner: FAKE_OWNER, repo: 'no-manifest' })).not.toBeNull()
    expect(await sourceHost.getFile({ owner: FAKE_OWNER, repo: 'no-manifest' }, 'package.json', 'main')).toBeNull()
    expect(await sourceHost.getRepo({ owner: FAKE_OWNER, repo: 'does-not-exist' })).toBeNull()
  })
})
