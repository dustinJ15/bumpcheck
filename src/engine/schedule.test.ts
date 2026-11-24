/**
 * One run of the scheduled task, in memory: which projects it enqueues,
 * what it does with stalled scans, and how a project it enqueued looks.
 */

import { describe, expect, it } from 'vitest'
import { LIMITS, SCHEDULE } from '../config'
import { checkOnDemandRequest, checkScanNowRequest } from '../core/requests'
import type { DependencyResult } from '../core/model'
import { FakeClock, MemoryRecordStore } from '../services/fakes'
import type { ProjectRecord } from '../services/types'
import { runScheduleTick, type ScheduleServices } from './schedule'

const HOUR = 60 * 60 * 1000

function world() {
  const store = new MemoryRecordStore()
  const clock = new FakeClock()
  const enqueued: string[] = []
  const failing = new Set<string>()
  const services: ScheduleServices = {
    store,
    clock,
    enqueueScan: async (projectId) => {
      if (failing.has(projectId)) throw new Error('job room unavailable')
      enqueued.push(projectId)
    },
  }
  const iso = (offsetMs = 0) => new Date(clock.now() + offsetMs).toISOString()

  /** A scanned project that is due, opened an hour ago. Override to change that. */
  function seed(id: string, fields: Partial<ProjectRecord> = {}) {
    store.seedProject({
      id,
      userId: 'user-1',
      repoOwner: 'acme',
      repoName: id,
      scanStatus: 'done',
      lastScanAt: iso(-LIMITS.rescanIntervalMs),
      nextDueAt: iso(0),
      lastOpenedAt: iso(-HOUR),
      ...fields,
    })
  }
  const project = (id: string) => store.projects.get(id)!
  return { services, store, clock, enqueued, failing, seed, project, iso }
}

const zod: DependencyResult = { name: 'zod', group: 'runtime', declared: '^3.22.0', current: '3.22.0', target: '3.23.8', triage: 'minor' }

describe('runScheduleTick: daily scans', () => {
  it('enqueues a due project and marks it queued, with a sign of life', async () => {
    const w = world()
    w.seed('due')

    const result = await runScheduleTick(w.services)

    expect(w.enqueued).toEqual(['due'])
    expect(result.enqueued).toEqual(['due'])
    expect(w.project('due')).toMatchObject({ scanStatus: 'queued', scanProgress: null, scanHeartbeatAt: w.iso() })
  })

  it('leaves alone projects that are not due, idle, or already scanning', async () => {
    const w = world()
    w.seed('not-due', { nextDueAt: w.iso(1) })
    w.seed('idle', { lastOpenedAt: w.iso(-LIMITS.idlePauseMs) })
    w.seed('queued', { scanStatus: 'queued', scanHeartbeatAt: w.iso(-1000) })
    w.seed('scanning', { scanStatus: 'scanning', scanHeartbeatAt: w.iso(-1000) })

    await runScheduleTick(w.services)

    expect(w.enqueued).toEqual([])
    expect(w.project('not-due').scanStatus).toBe('done')
    expect(w.project('idle').scanStatus).toBe('done')
  })

  it('does not enqueue the same project twice: a second run finds it queued', async () => {
    const w = world()
    w.seed('due')
    await runScheduleTick(w.services)
    await runScheduleTick(w.services)
    expect(w.enqueued).toEqual(['due'])
  })

  it(`enqueues at most ${SCHEDULE.scansPerTick} per run; the rest wait for the next run`, async () => {
    const w = world()
    for (let i = 0; i < SCHEDULE.scansPerTick + 2; i++) w.seed(`p${i}`, { nextDueAt: w.iso(-i * 1000) })

    await runScheduleTick(w.services)
    expect(w.enqueued).toHaveLength(SCHEDULE.scansPerTick)
    // The two least overdue are left.
    expect(w.enqueued).not.toContain('p0')
    expect(w.enqueued).not.toContain('p1')

    await runScheduleTick(w.services)
    expect(w.enqueued).toHaveLength(SCHEDULE.scansPerTick + 2)
  })

  it('scans an idle project again once its owner has opened it', async () => {
    const w = world()
    w.seed('idle', { lastOpenedAt: w.iso(-LIMITS.idlePauseMs - HOUR) })
    await runScheduleTick(w.services)
    expect(w.enqueued).toEqual([])

    w.store.projects.set('idle', { ...w.project('idle'), lastOpenedAt: w.iso() })
    await runScheduleTick(w.services)
    expect(w.enqueued).toEqual(['idle'])
  })

  it('marks a project failed when its scan cannot be enqueued, and still enqueues the others', async () => {
    const w = world()
    w.seed('broken', { nextDueAt: w.iso(-2000) })
    w.seed('fine', { nextDueAt: w.iso(-1000) })
    w.failing.add('broken')

    const result = await runScheduleTick(w.services)

    expect(w.enqueued).toEqual(['fine'])
    expect(result.enqueued).toEqual(['fine'])
    expect(w.project('broken')).toMatchObject({
      scanStatus: 'failed',
      scanError: 'The daily scan could not be started.',
      nextDueAt: w.iso(LIMITS.rescanIntervalMs),
    })
  })
})

describe('runScheduleTick: one bad row does not stop the run', () => {
  /** A store that cannot write one project (it was deleted a moment ago, say). */
  function unwritable(w: ReturnType<typeof world>, badId: string): ScheduleServices {
    return {
      ...w.services,
      store: {
        listProjects: () => w.store.listProjects(),
        updateProject: async (id, changes) => {
          if (id === badId) throw new Error(`could not update project ${id}`)
          await w.store.updateProject(id, changes)
        },
      },
    }
  }

  it('still enqueues the other due projects when one cannot be marked queued', async () => {
    const w = world()
    w.seed('gone', { nextDueAt: w.iso(-2000) })
    w.seed('fine', { nextDueAt: w.iso(-1000) })

    const result = await runScheduleTick(unwritable(w, 'gone'))

    expect(result.enqueued).toEqual(['fine'])
    // Nothing was enqueued for the project that could not be marked.
    expect(w.enqueued).toEqual(['fine'])
  })

  it('still handles the other stalled scans, and the due projects, when one stalled row cannot be written', async () => {
    const w = world()
    w.seed('gone', { scanStatus: 'scanning', scanHeartbeatAt: w.iso(-SCHEDULE.stalledScanMs) })
    w.seed('stuck', { scanStatus: 'scanning', scanHeartbeatAt: w.iso(-SCHEDULE.stalledScanMs) })
    w.seed('due')

    const result = await runScheduleTick(unwritable(w, 'gone'))

    expect(result.stalled).toEqual(['stuck'])
    expect(w.project('stuck').scanStatus).toBe('failed')
    expect(result.enqueued).toEqual(['due'])
  })
})

describe('runScheduleTick: stalled scans', () => {
  it('marks a full scan with no sign of life failed, with a reason, keeping its old results', async () => {
    const w = world()
    w.seed('stuck', {
      scanStatus: 'scanning',
      scanHeartbeatAt: w.iso(-SCHEDULE.stalledScanMs),
      scanProgress: { step: 'judge', message: 'Reading', done: 1, total: 3 },
      dependencies: [zod],
      nextDueAt: w.iso(-HOUR),
    })

    const result = await runScheduleTick(w.services)

    expect(result.stalled).toEqual(['stuck'])
    expect(w.project('stuck')).toMatchObject({
      scanStatus: 'failed',
      scanError: 'The scan stopped without finishing.',
      scanProgress: null,
      dependencies: [zod],
      // The stalled attempt counts as today's scan.
      nextDueAt: w.iso(LIMITS.rescanIntervalMs),
    })
    // It is not enqueued again by the same run.
    expect(w.enqueued).toEqual([])
  })

  it('leaves a scan alone until the stall time has passed', async () => {
    const w = world()
    w.seed('busy', { scanStatus: 'scanning', scanHeartbeatAt: w.iso(-SCHEDULE.stalledScanMs + 1) })
    const result = await runScheduleTick(w.services)
    expect(result.stalled).toEqual([])
    expect(w.project('busy').scanStatus).toBe('scanning')
  })

  it('marks a first scan that never left "queued" failed, which makes Retry possible', async () => {
    const w = world()
    const queuedAt = w.clock.now()
    w.seed('new', { scanStatus: 'queued', scanHeartbeatAt: w.iso(), lastScanAt: null, nextDueAt: null })
    const scanNow = () =>
      checkScanNowRequest({ scanStatus: w.project('new').scanStatus, lastScanRequestedAt: queuedAt, now: w.clock.now() })

    w.clock.advance(SCHEDULE.stalledScanMs)
    expect(scanNow()).toMatchObject({ ok: false, refusal: 'scan-running' })
    await runScheduleTick(w.services)

    expect(w.project('new')).toMatchObject({ scanStatus: 'failed', scanError: 'The scan stopped without finishing.' })
    expect(scanNow()).toEqual({ ok: true })
  })

  it('ends a stalled check as a failed check: the project is "done" again, and check and retry are accepted again', async () => {
    const w = world()
    const nextDueAt = w.iso(5 * HOUR)
    w.seed('checking', {
      scanStatus: 'queued',
      scanHeartbeatAt: w.iso(-SCHEDULE.stalledScanMs),
      checkRequests: ['zod'],
      dependencies: [zod],
      nextDueAt,
    })
    const mayCheck = () =>
      checkOnDemandRequest({ kind: 'check', scanStatus: w.project('checking').scanStatus, dependency: zod, verdict: null })
    expect(mayCheck()).toMatchObject({ ok: false, refusal: 'scan-running' })

    const result = await runScheduleTick(w.services)

    expect(result.stalled).toEqual(['checking'])
    expect(w.project('checking')).toMatchObject({
      scanStatus: 'done',
      scanError: 'The check stopped without finishing.',
      checkRequests: [],
      dependencies: [zod],
      // A check is not a scan: the schedule is untouched.
      nextDueAt,
    })
    expect(mayCheck()).toEqual({ ok: true })
  })
})
