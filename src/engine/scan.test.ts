/**
 * Engine tests: whole scans in memory, against the fakes. No network, no AI.
 */

import { describe, expect, it } from 'vitest'
import { LIMITS, VERDICT_SHAPE } from '../config'
import { utcDay } from '../core/limits'
import { CUT_OFF_ERROR } from '../core/verdict'
import type { DependencyResult, Verdict } from '../core/model'
import { selectDueProjects } from '../core/schedule'
import {
  FAKE_CUT_OFF,
  FakeClock,
  FakeJudge,
  FakeRegistry,
  FakeSourceHost,
  MemoryRecordStore,
  defaultFakeResponder,
  type FakeJudgeResponder,
  type FakeSourceHostData,
} from '../services/fakes'
import type { RegistryPackage } from '../services/types'
import { checkNewProject, type AddAttempts } from './add-project'
import { markScanFailed, runScan, runScanStep, startScan, type AlertHook, type ScanServices } from './scan'

const PROJECT = 'project-1'

/** For add-project checks that are not about the attempt cap. */
const noAttemptLimit: AddAttempts = { countToday: async () => 0, record: async () => 1 }

/** A package on the fake registry whose source is github.com/acme/<name>. */
function pkg(name: string, latest: string): [string, RegistryPackage] {
  return [name, { latest, versions: [latest], source: { owner: 'acme', repo: name } }]
}

/** A changelog with a section for each version given. */
function changelogFor(...versions: string[]): string {
  return versions.map((v) => `## ${v}\n- notes for ${v}`).join('\n\n')
}

interface WorldOptions {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packages?: Array<[string, RegistryPackage]>
  changelogs?: FakeSourceHostData['changelogs']
  releases?: FakeSourceHostData['releases']
  refusedReleases?: FakeSourceHostData['refusedReleases']
  packageJson?: string | null
  respond?: FakeJudgeResponder
}

/** Builds a fake world: one repo, one project, and fakes for every service. */
function world(options: WorldOptions = {}) {
  const files: Record<string, string> = {}
  const packageJson =
    options.packageJson === undefined
      ? JSON.stringify({ dependencies: options.dependencies ?? {}, devDependencies: options.devDependencies ?? {} })
      : options.packageJson
  if (packageJson !== null) files['package.json'] = packageJson

  const registry = new FakeRegistry(Object.fromEntries(options.packages ?? []))
  const sourceHost = new FakeSourceHost({
    repos: { 'dustin/app': { defaultBranch: 'main', files } },
    changelogs: options.changelogs,
    releases: options.releases,
    refusedReleases: options.refusedReleases,
  })
  const judge = new FakeJudge(options.respond)
  const store = new MemoryRecordStore()
  const clock = new FakeClock()
  const alerts: string[] = []
  const alertHook: AlertHook = async ({ projectId }) => {
    alerts.push(projectId)
  }
  store.seedProject({
    id: PROJECT,
    userId: 'user-1',
    repoOwner: 'dustin',
    repoName: 'app',
    lastOpenedAt: new Date(clock.now()).toISOString(),
  })

  const services: ScanServices = { registry, sourceHost, judge, store, clock, alertHook }
  return { services, registry, sourceHost, judge, store, clock, alerts }
}

function project(store: MemoryRecordStore) {
  const p = store.projects.get(PROJECT)
  if (!p) throw new Error('project missing')
  return p
}

function dep(deps: DependencyResult[], name: string): DependencyResult {
  const d = deps.find((x) => x.name === name)
  if (!d) throw new Error(`no dependency ${name}`)
  return d
}

function readyVerdict(key: string, packageName: string): Verdict {
  return {
    key,
    packageName,
    status: 'ready',
    label: 'safe',
    summary: 'Cached earlier.',
    changes: [],
    sourceUrl: 'https://example.test/CHANGELOG.md',
    inputTruncated: false,
    fromVersion: '4.0.0',
    toVersion: '5.1.0',
    decidedAt: '2026-11-01T00:00:00.000Z',
  }
}

describe('a whole scan', () => {
  it('triages every dependency, judges the majors and writes the results', async () => {
    const w = world({
      dependencies: { express: '^4.17.1', zod: '^3.22.0', local: 'file:../local' },
      devDependencies: { vitest: '^1.6.0' },
      packages: [pkg('express', '5.1.0'), pkg('zod', '3.23.8'), pkg('vitest', '1.6.0')],
      changelogs: { 'acme/express': changelogFor('5.1.0', '5.0.0', '4.17.1') },
    })

    const end = await runScan(w.services, startScan(PROJECT))

    expect(end).toMatchObject({ step: 'done', outcome: 'succeeded' })
    const p = project(w.store)
    expect(p.scanStatus).toBe('done')
    expect(p.lastScanAt).toBe(new Date(w.clock.now()).toISOString())
    expect(p.nextDueAt).toBe(new Date(w.clock.now() + LIMITS.rescanIntervalMs).toISOString())
    expect(p.dependencies.map((d) => [d.name, d.triage])).toEqual([
      ['express', 'major'],
      ['zod', 'minor'],
      ['local', 'not-checked'],
      ['vitest', 'up-to-date'],
    ])
    expect(dep(p.dependencies, 'express').verdictKey).toBe('express@4->5.1')
    expect(w.store.verdicts.get('express@4->5.1')).toMatchObject({ status: 'ready', label: 'breaking' })
    // Only the major was judged, with only the in-range changelog sections.
    expect(w.judge.calls).toHaveLength(1)
    expect(w.judge.calls[0].changelog).toContain('notes for 5.0.0')
    expect(w.judge.calls[0].changelog).not.toContain('notes for 4.17.1')
    // The local path was never looked up.
    expect(w.registry.calls).not.toContain('local')
    expect(w.alerts).toEqual([PROJECT])
  })
})

describe('shared verdict cache', () => {
  it('a cache hit spends no judge call', async () => {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.3')],
      changelogs: { 'acme/express': changelogFor('5.0.0') },
    })
    await w.store.putVerdict(readyVerdict('express@4->5.1', 'express'))

    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls).toEqual([])
    expect(w.store.aiCalls.size).toBe(0)
    expect(dep(project(w.store).dependencies, 'express').verdictKey).toBe('express@4->5.1')
    expect(project(w.store).scanReport).toEqual({ judged: 0, deferredByScanCap: 0, deferredByDailyCeiling: 0 })
  })
})

describe('per-scan cap', () => {
  it('stops at 15 new verdicts, runtime first, and reports the remainder', async () => {
    const runtimeNames = Array.from({ length: 10 }, (_, i) => `run-${i}`)
    const devNames = Array.from({ length: 10 }, (_, i) => `dev-${i}`)
    const all = [...runtimeNames, ...devNames]
    const w = world({
      // Dev listed first in the file on purpose: runtime must still go first.
      devDependencies: Object.fromEntries(devNames.map((n) => [n, '^1.0.0'])),
      dependencies: Object.fromEntries(runtimeNames.map((n) => [n, '^1.0.0'])),
      packages: all.map((n) => pkg(n, '2.0.0')),
      changelogs: Object.fromEntries(all.map((n) => [`acme/${n}`, changelogFor('2.0.0')])),
    })

    await runScan(w.services, startScan(PROJECT))

    expect(LIMITS.newVerdictsPerScan).toBe(15)
    expect(w.judge.calls).toHaveLength(15)
    const judged = w.judge.calls.map((c) => c.packageName)
    expect(judged).toEqual([...runtimeNames, ...devNames.slice(0, 5)])

    const p = project(w.store)
    expect(p.scanReport).toEqual({ judged: 15, deferredByScanCap: 5, deferredByDailyCeiling: 0 })
    for (const name of devNames.slice(5)) {
      expect(dep(p.dependencies, name)).toMatchObject({ triage: 'major', deferredBy: 'scan-cap' })
      expect(dep(p.dependencies, name).verdictKey).toBeUndefined()
    }
  })

  it('reads the deferred majors on the next scan', async () => {
    const names = Array.from({ length: 17 }, (_, i) => `p-${i}`)
    const w = world({
      dependencies: Object.fromEntries(names.map((n) => [n, '^1.0.0'])),
      packages: names.map((n) => pkg(n, '2.0.0')),
      changelogs: Object.fromEntries(names.map((n) => [`acme/${n}`, changelogFor('2.0.0')])),
    })

    await runScan(w.services, startScan(PROJECT))
    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls).toHaveLength(17)
    expect(project(w.store).scanReport).toEqual({ judged: 2, deferredByScanCap: 0, deferredByDailyCeiling: 0 })
    expect(project(w.store).dependencies.every((d) => d.verdictKey !== undefined)).toBe(true)
  })
})

describe('daily AI ceiling', () => {
  it('stops judging but still triages and writes the results', async () => {
    const w = world({
      dependencies: { express: '^4.0.0', chalk: '^4.1.0', zod: '^3.22.0' },
      packages: [pkg('express', '5.1.0'), pkg('chalk', '5.4.1'), pkg('zod', '3.23.8')],
      changelogs: {
        'acme/express': changelogFor('5.0.0'),
        'acme/chalk': changelogFor('5.0.0'),
      },
    })
    w.store.aiCalls.set(utcDay(w.clock.now()), LIMITS.aiCallsPerDay)

    const end = await runScan(w.services, startScan(PROJECT))

    expect(end.outcome).toBe('succeeded')
    expect(w.judge.calls).toEqual([])
    const p = project(w.store)
    expect(p.scanStatus).toBe('done')
    expect(p.dependencies.map((d) => [d.name, d.triage])).toEqual([
      ['express', 'major'],
      ['chalk', 'major'],
      ['zod', 'minor'],
    ])
    expect(dep(p.dependencies, 'express').deferredBy).toBe('daily-ceiling')
    expect(dep(p.dependencies, 'chalk').deferredBy).toBe('daily-ceiling')
    expect(p.scanReport).toEqual({ judged: 0, deferredByScanCap: 0, deferredByDailyCeiling: 2 })
  })

  it('stops mid-scan when the ceiling is reached, and counts every call', async () => {
    const w = world({
      dependencies: { a: '^1.0.0', b: '^1.0.0', c: '^1.0.0' },
      packages: [pkg('a', '2.0.0'), pkg('b', '2.0.0'), pkg('c', '2.0.0')],
      changelogs: { 'acme/a': changelogFor('2.0.0'), 'acme/b': changelogFor('2.0.0'), 'acme/c': changelogFor('2.0.0') },
    })
    const day = utcDay(w.clock.now())
    w.store.aiCalls.set(day, LIMITS.aiCallsPerDay - 1)

    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls.map((c) => c.packageName)).toEqual(['a'])
    expect(w.store.aiCalls.get(day)).toBe(LIMITS.aiCallsPerDay)
    expect(project(w.store).scanReport).toEqual({ judged: 1, deferredByScanCap: 0, deferredByDailyCeiling: 2 })
  })
})

describe('daily AI ceiling: the second attempt is an AI call too', () => {
  it('does not make the retry attempt when the first attempt used the last call of the day', async () => {
    const w = world({
      dependencies: { express: '^4.0.0', chalk: '^4.0.0' },
      packages: [pkg('express', '5.1.0'), pkg('chalk', '5.0.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0'), 'acme/chalk': changelogFor('5.0.0') },
      respond: () => 'not a verdict',
    })
    const day = utcDay(w.clock.now())
    w.store.aiCalls.set(day, LIMITS.aiCallsPerDay - 1)

    await runScan(w.services, startScan(PROJECT))

    // One call, the 150th. The retry would have been the 151st.
    expect(w.judge.calls).toHaveLength(1)
    expect(w.store.aiCalls.get(day)).toBe(LIMITS.aiCallsPerDay)
    // Not stored as failed on half its attempts: left for a later scan, with the reason.
    expect(w.store.verdicts.size).toBe(0)
    const p = project(w.store)
    expect(dep(p.dependencies, 'express').deferredBy).toBe('daily-ceiling')
    expect(dep(p.dependencies, 'chalk').deferredBy).toBe('daily-ceiling')
    expect(p.scanReport).toEqual({ judged: 0, deferredByScanCap: 0, deferredByDailyCeiling: 2 })
  })
})

describe('no changelog', () => {
  it('means no judge call, and a "no changelog" verdict linking to the releases page', async () => {
    const w = world({ dependencies: { express: '^4.0.0' }, packages: [pkg('express', '5.1.0')] })

    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls).toEqual([])
    expect(w.store.aiCalls.size).toBe(0)
    expect(w.store.verdicts.get('express@4->5.1')).toMatchObject({
      status: 'no-changelog',
      sourceUrl: 'https://github.com/acme/express/releases',
    })
    expect(dep(project(w.store).dependencies, 'express').verdictKey).toBe('express@4->5.1')
    // Both sources were tried before giving up.
    expect(w.sourceHost.calls.map((c) => c.method)).toContain('getChangelog')
    expect(w.sourceHost.calls.map((c) => c.method)).toContain('getReleases')
  })

  it('means no judge call when the changelog has no section in range', async () => {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      changelogs: { 'acme/express': changelogFor('4.0.0', '3.0.0') },
    })
    await runScan(w.services, startScan(PROJECT))
    expect(w.judge.calls).toEqual([])
    expect(w.store.verdicts.get('express@4->5.1')?.status).toBe('no-changelog')
  })

  it('means no judge call when the registry names no source repo', async () => {
    const w = world({
      dependencies: { mystery: '^1.0.0' },
      packages: [['mystery', { latest: '2.0.0', versions: ['2.0.0'], source: null }]],
    })
    await runScan(w.services, startScan(PROJECT))
    expect(w.judge.calls).toEqual([])
    expect(w.store.verdicts.get('mystery@1->2.0')).toMatchObject({
      status: 'no-changelog',
      sourceUrl: 'https://www.npmjs.com/package/mystery',
    })
  })

  it('falls back to GitHub releases when there is no CHANGELOG.md', async () => {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      releases: { 'acme/express': [{ tag: 'v5.0.0', body: 'release notes 5.0.0' }] },
    })
    await runScan(w.services, startScan(PROJECT))
    expect(w.judge.calls).toHaveLength(1)
    expect(w.judge.calls[0].changelog).toContain('release notes 5.0.0')
    expect(w.store.verdicts.get('express@4->5.1')?.sourceUrl).toBe('https://github.com/acme/express/releases')
  })
})

describe('a refused Releases request', () => {
  const refusedWorld = () =>
    world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      refusedReleases: ['acme/express'],
    })

  it('stores no verdict and spends no judge call: the dependency is not read this time', async () => {
    const w = refusedWorld()

    const end = await runScan(w.services, startScan(PROJECT))

    expect(end.outcome).toBe('succeeded')
    expect(w.judge.calls).toEqual([])
    expect(w.store.aiCalls.size).toBe(0)
    // Nothing goes into the cache every project shares.
    expect(w.store.verdicts.size).toBe(0)
    const express = dep(project(w.store).dependencies, 'express')
    expect(express.verdictKey).toBeUndefined()
    expect(express.deferredBy).toBe('source-refused')
    expect(project(w.store).scanStatus).toBe('done')
  })

  it('is tried again by the next scan, which reads the release notes once GitHub answers', async () => {
    const w = refusedWorld()
    await runScan(w.services, startScan(PROJECT))

    w.sourceHost.data.refusedReleases = []
    w.sourceHost.data.releases = { 'acme/express': [{ tag: 'v5.0.0', body: 'release notes 5.0.0' }] }
    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls.map((c) => c.packageName)).toEqual(['express'])
    const express = dep(project(w.store).dependencies, 'express')
    expect(express.verdictKey).toBe('express@4->5.1')
    expect(express.deferredBy).toBeUndefined()
  })

  it('does not count against the per-scan cap, and the scan goes on to the next dependency', async () => {
    const w = world({
      dependencies: { express: '^4.0.0', chalk: '^4.0.0' },
      packages: [pkg('express', '5.1.0'), pkg('chalk', '5.0.0')],
      changelogs: { 'acme/chalk': changelogFor('5.0.0') },
      refusedReleases: ['acme/express'],
    })
    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls.map((c) => c.packageName)).toEqual(['chalk'])
    expect(project(w.store).scanReport).toEqual({ judged: 1, deferredByScanCap: 0, deferredByDailyCeiling: 0 })
  })

  it('is not asked for at all when CHANGELOG.md has the text', async () => {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0') },
      refusedReleases: ['acme/express'],
    })
    await runScan(w.services, startScan(PROJECT))
    expect(w.store.verdicts.get('express@4->5.1')?.status).toBe('ready')
  })
})

describe('a verdict is not paid for twice', () => {
  const twoMajors = () =>
    world({
      dependencies: { express: '^4.0.0', chalk: '^4.0.0' },
      packages: [pkg('express', '5.1.0'), pkg('chalk', '5.0.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0'), 'acme/chalk': changelogFor('5.0.0') },
    })

  it('when the verdict was stored but the write was reported as failed, the retried step uses the stored verdict', async () => {
    const w = twoMajors()
    // The record room stores the verdict, then the reply is lost: the step sees a failure.
    const putVerdict = w.store.putVerdict.bind(w.store)
    let failNext = true
    w.store.putVerdict = async (verdict) => {
      await putVerdict(verdict)
      if (failNext) {
        failNext = false
        throw new Error('record room timed out')
      }
    }

    let state = await runScan(w.services, startScan(PROJECT), { maxSteps: 3 })
    expect(state.step).toBe('judge')
    await expect(runScanStep(w.services, state)).rejects.toThrow('record room timed out')
    // The job retries from the last state that was saved: the same judge step.
    state = await runScan(w.services, state)

    expect(state.outcome).toBe('succeeded')
    expect(w.judge.calls.map((c) => c.packageName)).toEqual(['express', 'chalk'])
    expect(w.store.aiCalls.get(utcDay(w.clock.now()))).toBe(2)
    expect(dep(project(w.store).dependencies, 'express').verdictKey).toBe('express@4->5.1')
  })

  it('when a scan resumes from an older checkpoint, verdicts stored since then are not judged again', async () => {
    const w = twoMajors()
    const checkpoint = await runScan(w.services, startScan(PROJECT), { maxSteps: 3 })
    expect(checkpoint.step).toBe('judge')
    // Both verdicts are judged and stored, but the job dies before saving its state.
    await runScan(w.services, checkpoint)
    expect(w.judge.calls).toHaveLength(2)

    const end = await runScan(w.services, checkpoint)

    expect(end.outcome).toBe('succeeded')
    expect(w.judge.calls).toHaveLength(2)
    expect(end.report.judged).toBe(0)
  })

  it('a failed verdict stored since the checkpoint is kept too: its two attempts were already paid for', async () => {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0') },
      respond: () => 'not a verdict',
    })
    const checkpoint = await runScan(w.services, startScan(PROJECT), { maxSteps: 3 })
    await runScan(w.services, checkpoint)
    expect(w.judge.calls).toHaveLength(2)

    await runScan(w.services, checkpoint)

    expect(w.judge.calls).toHaveLength(2)
    expect(w.store.verdicts.get('express@4->5.1')?.status).toBe('failed')
  })
})

describe('bad judge responses', () => {
  it('retries once, then stores "failed"', async () => {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0') },
      respond: () => 'not json at all',
    })

    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls).toHaveLength(2)
    expect(w.store.aiCalls.get(utcDay(w.clock.now()))).toBe(2)
    const verdict = w.store.verdicts.get('express@4->5.1')
    expect(verdict).toMatchObject({ status: 'failed', failureReason: 'response is not valid JSON' })
    expect(dep(project(w.store).dependencies, 'express').verdictKey).toBe('express@4->5.1')
  })

  it('stores the verdict when the retry succeeds', async () => {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0') },
      respond: (input, attempt) => (attempt === 1 ? { label: 'maybe' } : defaultFakeResponder(input, attempt)),
    })
    await runScan(w.services, startScan(PROJECT))
    expect(w.judge.calls).toHaveLength(2)
    expect(w.store.verdicts.get('express@4->5.1')).toMatchObject({ status: 'ready', label: 'breaking' })
  })

  it('treats a judge that throws as a failed attempt', async () => {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0') },
      respond: () => {
        throw new Error('model unavailable')
      },
    })
    await runScan(w.services, startScan(PROJECT))
    expect(w.judge.calls).toHaveLength(2)
    expect(w.store.verdicts.get('express@4->5.1')).toMatchObject({ status: 'failed', failureReason: 'model unavailable' })
  })
})

describe('an answer cut off at the output cap', () => {
  const express = {
    dependencies: { express: '^4.0.0' },
    packages: [pkg('express', '5.1.0')],
    changelogs: { 'acme/express': changelogFor('5.0.0') },
  }

  it('is retried with the shorter request, and the retry is stored as ready', async () => {
    const w = world({
      ...express,
      respond: (input, attempt) => (attempt === 1 ? FAKE_CUT_OFF : defaultFakeResponder(input, attempt)),
    })

    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls.map((c) => c.maxChanges)).toEqual([
      VERDICT_SHAPE.changesPerVerdict,
      VERDICT_SHAPE.shorterChangesPerVerdict,
    ])
    // Both attempts are AI calls.
    expect(w.store.aiCalls.get(utcDay(w.clock.now()))).toBe(2)
    expect(w.store.verdicts.get('express@4->5.1')).toMatchObject({ status: 'ready', label: 'breaking' })
  })

  it('twice is stored as failed, with the "cut off" reason', async () => {
    const w = world({ ...express, respond: () => FAKE_CUT_OFF })

    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls).toHaveLength(2)
    expect(w.store.aiCalls.get(utcDay(w.clock.now()))).toBe(2)
    expect(w.store.verdicts.get('express@4->5.1')).toMatchObject({ status: 'failed', failureReason: CUT_OFF_ERROR })
  })

  it('a failure that was not a cut-off is retried with the same request', async () => {
    const w = world({ ...express, respond: () => 'not json at all' })

    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls.map((c) => c.maxChanges)).toEqual([
      VERDICT_SHAPE.changesPerVerdict,
      VERDICT_SHAPE.changesPerVerdict,
    ])
  })

  it('the shorter retry is still checked against the daily ceiling', async () => {
    const w = world({ ...express, respond: () => FAKE_CUT_OFF })
    const day = utcDay(w.clock.now())
    w.store.aiCalls.set(day, LIMITS.aiCallsPerDay - 1)

    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls).toHaveLength(1)
    expect(w.store.aiCalls.get(day)).toBe(LIMITS.aiCallsPerDay)
    expect(w.store.verdicts.size).toBe(0)
    expect(dep(project(w.store).dependencies, 'express').deferredBy).toBe('daily-ceiling')
  })
})

describe('a failed scan keeps old verdicts', () => {
  async function scannedWorld(options: WorldOptions) {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0') },
      ...options,
    })
    await runScan(w.services, startScan(PROJECT))
    const before = project(w.store).dependencies
    expect(dep(before, 'express').verdictKey).toBe('express@4->5.1')
    return { w, before }
  }

  it('when package.json has gone', async () => {
    const { w, before } = await scannedWorld({})
    w.sourceHost.data.repos!['dustin/app'].files = {}

    const end = await runScan(w.services, startScan(PROJECT))

    expect(end).toMatchObject({ outcome: 'failed', failureReason: 'The repository has no package.json at its root.' })
    const p = project(w.store)
    expect(p.scanStatus).toBe('failed')
    expect(p.scanError).toBe('The repository has no package.json at its root.')
    expect(p.dependencies).toEqual(before)
    expect(w.store.verdicts.get('express@4->5.1')?.status).toBe('ready')
  })

  it('when the repo is the problem, the attempt is recorded: the project is not due again until the re-scan interval has passed', async () => {
    const { w } = await scannedWorld({})
    // A day later the daily scan finds the package.json gone.
    w.clock.advance(LIMITS.rescanIntervalMs)
    const failedAt = w.clock.now()
    const lastGoodScanAt = project(w.store).lastScanAt
    const due = () => selectDueProjects([project(w.store)], w.clock.now())
    expect(due()).toEqual([PROJECT])
    w.sourceHost.data.repos!['dustin/app'].files = {}

    await runScan(w.services, startScan(PROJECT))

    const p = project(w.store)
    expect(p.scanStatus).toBe('failed')
    expect(p.nextDueAt).toBe(new Date(failedAt + LIMITS.rescanIntervalMs).toISOString())
    // "Last scan" still means the last one that worked.
    expect(p.lastScanAt).toBe(lastGoodScanAt)
    // The hourly task leaves it alone for a day, then tries again.
    w.clock.advance(60 * 60 * 1000)
    expect(due()).toEqual([])
    w.clock.advance(LIMITS.rescanIntervalMs - 60 * 60 * 1000 - 1)
    expect(due()).toEqual([])
    w.clock.advance(1)
    expect(due()).toEqual([PROJECT])
  })

  it('when package.json is not valid JSON', async () => {
    const { w, before } = await scannedWorld({})
    w.sourceHost.data.repos!['dustin/app'].files = { 'package.json': '{ nope' }
    const end = await runScan(w.services, startScan(PROJECT))
    expect(end.failureReason).toBe('package.json is not valid JSON.')
    expect(project(w.store).dependencies).toEqual(before)
  })

  it('when a service throws mid-scan and the job gives up', async () => {
    const { w, before } = await scannedWorld({})
    w.services.registry = {
      getPackage: async () => {
        throw new Error('registry down')
      },
    }

    await expect(runScan(w.services, startScan(PROJECT))).rejects.toThrow('registry down')
    await markScanFailed(w.services, PROJECT, 'registry down')

    const p = project(w.store)
    expect(p).toMatchObject({ scanStatus: 'failed', scanError: 'registry down' })
    expect(p.dependencies).toEqual(before)
  })
})

describe('signs of life', () => {
  it('records the time whenever the scan writes progress, and clears nothing the stall check needs', async () => {
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0') },
    })
    const start = w.clock.now()

    let state = await runScanStep(w.services, startScan(PROJECT))
    expect(project(w.store)).toMatchObject({ scanStatus: 'scanning', scanHeartbeatAt: new Date(start).toISOString() })

    // Each later step that reports progress moves the time forward.
    w.clock.advance(60_000)
    state = await runScanStep(w.services, state)
    expect(project(w.store).scanHeartbeatAt).toBe(new Date(start + 60_000).toISOString())

    w.clock.advance(60_000)
    state = await runScanStep(w.services, state) // attach-cached: no progress write
    state = await runScanStep(w.services, state) // judge
    expect(state.step).toBe('write')
    expect(project(w.store).scanHeartbeatAt).toBe(new Date(start + 120_000).toISOString())
  })

  it('an on-demand check records it too', async () => {
    const w = world({ dependencies: { zod: '^3.22.0' }, packages: [pkg('zod', '3.23.8')] })
    await runScan(w.services, startScan(PROJECT))
    w.clock.advance(5 * 60_000)
    w.store.projects.set(PROJECT, { ...project(w.store), checkRequests: ['zod'], scanStatus: 'queued' })

    await runScanStep(w.services, startScan(PROJECT, { onDemand: true }))

    expect(project(w.store).scanHeartbeatAt).toBe(new Date(w.clock.now()).toISOString())
  })
})

describe('the app owner and the limits', () => {
  it('passes the per-user project limit but is stopped by the daily AI ceiling like everyone else', async () => {
    // Adding a project: the owner is past the limit of 3 and is still allowed.
    const existing = Array.from({ length: LIMITS.projectsPerUser + 2 }, (_, i) => ({ owner: 'dustin', repo: `other-${i}` }))
    const w = world({
      dependencies: { express: '^4.0.0' },
      packages: [pkg('express', '5.1.0')],
      changelogs: { 'acme/express': changelogFor('5.0.0') },
    })
    const asOwner = await checkNewProject({ repoInput: 'dustin/app', isAppOwner: true, existing, now: w.clock.now() }, w.sourceHost, noAttemptLimit)
    const asMember = await checkNewProject({ repoInput: 'dustin/app', isAppOwner: false, existing, now: w.clock.now() }, w.sourceHost, noAttemptLimit)
    expect(asOwner).toMatchObject({ ok: true })
    expect(asMember).toMatchObject({ ok: false, refusal: 'project-limit' })

    // Scanning it: the ceiling is app-wide and the scan does not know or care whose project it is.
    w.store.projects.set(PROJECT, { ...project(w.store), userId: 'the-app-owner' })
    w.store.aiCalls.set(utcDay(w.clock.now()), LIMITS.aiCallsPerDay)
    await runScan(w.services, startScan(PROJECT))

    expect(w.judge.calls).toEqual([])
    expect(dep(project(w.store).dependencies, 'express').deferredBy).toBe('daily-ceiling')
    expect(project(w.store).scanReport).toEqual({ judged: 0, deferredByScanCap: 0, deferredByDailyCeiling: 1 })
  })
})

describe('bad input', () => {
  it('fails a repo that is not found or private', async () => {
    const w = world()
    w.store.seedProject({ id: PROJECT, userId: 'user-1', repoOwner: 'nobody', repoName: 'nothing' })
    const end = await runScan(w.services, startScan(PROJECT))
    expect(end.failureReason).toBe('The repository was not found or is not public.')
    expect(w.registry.calls).toEqual([])
  })

  it('fails a package.json with more dependencies than the limit', async () => {
    const many = Object.fromEntries(
      Array.from({ length: LIMITS.dependenciesPerProject + 1 }, (_, i) => [`p-${i}`, '^1.0.0']),
    )
    const w = world({ dependencies: many })
    const end = await runScan(w.services, startScan(PROJECT))
    expect(end.outcome).toBe('failed')
    expect(end.failureReason).toContain(String(LIMITS.dependenciesPerProject))
    expect(w.registry.calls).toEqual([])
  })
})

describe('resumable state', () => {
  const options: WorldOptions = {
    dependencies: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p-${i}`, '^1.0.0'])),
    devDependencies: { tool: '^2.0.0' },
    packages: [
      ...Array.from({ length: 30 }, (_, i) => pkg(`p-${i}`, i < 3 ? '2.0.0' : '1.0.5')),
      pkg('tool', '3.0.0'),
    ],
    changelogs: {
      'acme/p-0': changelogFor('2.0.0'),
      'acme/p-1': changelogFor('2.0.0'),
      'acme/tool': changelogFor('3.0.0'),
    },
  }

  it('a scan interrupted between steps resumes from its saved state', async () => {
    // Reference: the same scan run straight through.
    const straight = world(options)
    await runScan(straight.services, startScan(PROJECT))

    // Interrupted: a few steps, then the state is saved as JSON (as a job
    // checkpoint would) and the scan continues with freshly built services
    // sharing the same store, as on the job's next tick.
    const first = world(options)
    let state = startScan(PROJECT)
    // read-manifest, two look-up batches, attach-cached, then one judge step.
    for (let i = 0; i < 5; i++) state = await runScanStep(first.services, state)
    expect(state.step).toBe('judge')
    expect(first.judge.calls).toHaveLength(1)
    const saved = JSON.stringify(state)

    const judgedBefore = first.judge.calls.length
    const resumed = { ...first.services, registry: new FakeRegistry(Object.fromEntries(options.packages!)), judge: new FakeJudge() }
    const end = await runScan(resumed, JSON.parse(saved))

    expect(end.outcome).toBe('succeeded')
    // Work done before the checkpoint is not repeated.
    expect((resumed.registry as FakeRegistry).calls).toEqual([])
    expect(judgedBefore + (resumed.judge as FakeJudge).calls.length).toBe(straight.judge.calls.length)
    // And the result matches the uninterrupted scan.
    expect(project(first.store).dependencies).toEqual(project(straight.store).dependencies)
    expect([...first.store.verdicts.keys()].sort()).toEqual([...straight.store.verdicts.keys()].sort())
  })

  it('looks up the registry in batches, checkpointing between them', async () => {
    const w = world(options)
    let state = startScan(PROJECT)
    state = await runScanStep(w.services, state) // read-manifest
    state = await runScanStep(w.services, state) // first look-up batch
    expect(state.step).toBe('look-up')
    expect(w.registry.calls.length).toBeLessThan(31)
    expect(project(w.store).scanProgress).toMatchObject({ step: 'look-up', total: 31 })
  })

  it('does not change the state it was given', async () => {
    const w = world(options)
    const start = startScan(PROJECT)
    const copy = structuredClone(start)
    await runScanStep(w.services, start)
    expect(start).toEqual(copy)
  })
})

describe('alert hook', () => {
  it('is called after a successful scan, not after a failed one or an on-demand one', async () => {
    const ok = world({ dependencies: {} })
    await runScan(ok.services, startScan(PROJECT))
    expect(ok.alerts).toEqual([PROJECT])

    const failed = world({ packageJson: null })
    await runScan(failed.services, startScan(PROJECT))
    expect(failed.alerts).toEqual([])

    const onDemand = world({ dependencies: {} })
    await runScan(onDemand.services, startScan(PROJECT, { onDemand: true }))
    expect(onDemand.alerts).toEqual([])
  })
})

describe('dependency names that are also Object property names', () => {
  it('looks up and triages packages called "constructor" and "toString" like any other', async () => {
    const w = world({
      dependencies: { constructor: '^1.0.0', toString: '^1.0.0', express: '^4.0.0' },
      packages: [pkg('constructor', '1.2.0'), pkg('toString', '2.0.0'), pkg('express', '4.0.0')],
    })
    const end = await runScan(w.services, startScan(PROJECT))

    expect(end.outcome).toBe('succeeded')
    expect(w.registry.calls).toEqual(['constructor', 'toString', 'express'])
    const deps = project(w.store).dependencies
    expect(dep(deps, 'constructor')).toMatchObject({ triage: 'minor', target: '1.2.0' })
    expect(dep(deps, 'toString')).toMatchObject({ triage: 'major', target: '2.0.0' })
  })

  it('ignores a "__proto__" entry, which cannot be a package', async () => {
    const w = world({
      packageJson: '{"dependencies":{"__proto__":"^1.0.0","express":"^4.0.0"}}',
      packages: [pkg('express', '4.0.0')],
    })
    const end = await runScan(w.services, startScan(PROJECT), { maxSteps: 50 })

    expect(end.outcome).toBe('succeeded')
    expect(project(w.store).dependencies.map((d) => d.name)).toEqual(['express'])
  })
})
