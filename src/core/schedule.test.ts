import { describe, expect, it } from 'vitest'
import { LIMITS, SCHEDULE } from '../config'
import type { ScanStatus } from './model'
import { dueTimeAfterOpening, selectDueProjects, selectStalledScans, type SchedulableProject } from './schedule'

const now = Date.parse('2026-11-23T12:00:00.000Z')
const iso = (time: number) => new Date(time).toISOString()

/** A project that is due, opened a minute ago and not scanning. Override to break one of those. */
function project(id: string, overrides: Partial<SchedulableProject> = {}): SchedulableProject {
  return {
    id,
    scanStatus: 'done',
    nextDueAt: iso(now - 1),
    lastOpenedAt: iso(now - 60_000),
    scanHeartbeatAt: null,
    checkRequests: [],
    ...overrides,
  }
}

describe('selectDueProjects: which projects the hourly task scans', () => {
  it('picks a project that is due, not idle and not scanning', () => {
    expect(selectDueProjects([project('a')], now)).toEqual(['a'])
  })

  it('picks a project at its due time, not a millisecond before', () => {
    expect(selectDueProjects([project('a', { nextDueAt: iso(now) })], now)).toEqual(['a'])
    expect(selectDueProjects([project('a', { nextDueAt: iso(now + 1) })], now)).toEqual([])
  })

  it('picks a project that has never been scanned (no due time)', () => {
    expect(selectDueProjects([project('a', { nextDueAt: null, scanStatus: 'idle' })], now)).toEqual(['a'])
  })

  it('skips an idle project: one its owner has not opened for 7 days', () => {
    expect(selectDueProjects([project('a', { lastOpenedAt: iso(now - LIMITS.idlePauseMs) })], now)).toEqual([])
    expect(selectDueProjects([project('a', { lastOpenedAt: iso(now - LIMITS.idlePauseMs + 1) })], now)).toEqual(['a'])
  })

  it('skips a project that was never opened', () => {
    expect(selectDueProjects([project('a', { lastOpenedAt: null })], now)).toEqual([])
  })

  it.each(['queued', 'scanning'] as const)('skips a project that is already %s: one scan at a time', (scanStatus) => {
    expect(selectDueProjects([project('a', { scanStatus })], now)).toEqual([])
  })

  it.each(['idle', 'done', 'failed'] as const)('picks a due project whose status is %s', (scanStatus: ScanStatus) => {
    expect(selectDueProjects([project('a', { scanStatus })], now)).toEqual(['a'])
  })

  it(`picks at most ${SCHEDULE.scansPerTick} per run by default, the most overdue first`, () => {
    const projects = Array.from({ length: SCHEDULE.scansPerTick + 3 }, (_, i) =>
      // p0 is the least overdue, the last one the most.
      project(`p${i}`, { nextDueAt: iso(now - 1000 * (i + 1)) }),
    )
    const picked = selectDueProjects(projects, now)
    expect(picked).toHaveLength(SCHEDULE.scansPerTick)
    expect(picked[0]).toBe(`p${SCHEDULE.scansPerTick + 2}`)
    expect(picked).not.toContain('p0')
    expect(SCHEDULE.scansPerTick).toBe(5)
  })

  it('puts never-scanned projects before overdue ones, and respects a given bound', () => {
    const projects = [project('old', { nextDueAt: iso(now - 5000) }), project('new', { nextDueAt: null }), project('older', { nextDueAt: iso(now - 9000) })]
    expect(selectDueProjects(projects, now, 2)).toEqual(['new', 'older'])
    expect(selectDueProjects(projects, now, 0)).toEqual([])
  })
})

describe('selectStalledScans: scans that stopped without saying so', () => {
  const stalledAt = iso(now - SCHEDULE.stalledScanMs)
  const aliveAt = iso(now - SCHEDULE.stalledScanMs + 1)

  it.each(['queued', 'scanning'] as const)('picks a %s project with no sign of life for the stall time', (scanStatus) => {
    expect(selectStalledScans([project('a', { scanStatus, scanHeartbeatAt: stalledAt })], now).map((p) => p.id)).toEqual(['a'])
    expect(selectStalledScans([project('a', { scanStatus, scanHeartbeatAt: aliveAt })], now)).toEqual([])
  })

  it('picks a queued project that never recorded a sign of life', () => {
    expect(selectStalledScans([project('a', { scanStatus: 'queued', scanHeartbeatAt: null })], now)).toHaveLength(1)
  })

  it.each(['idle', 'done', 'failed'] as const)('never picks a project whose status is %s', (scanStatus) => {
    expect(selectStalledScans([project('a', { scanStatus, scanHeartbeatAt: stalledAt })], now)).toEqual([])
  })
})

describe('dueTimeAfterOpening: idle resume', () => {
  it('makes an idle project due now when its owner opens it', () => {
    const idle = { lastOpenedAt: iso(now - LIMITS.idlePauseMs), nextDueAt: iso(now + 5 * 60 * 60 * 1000) }
    expect(dueTimeAfterOpening(idle, now)).toBe(iso(now))
  })

  it('leaves the due time of a project that was not idle alone', () => {
    const nextDueAt = iso(now + 5 * 60 * 60 * 1000)
    expect(dueTimeAfterOpening({ lastOpenedAt: iso(now - LIMITS.idlePauseMs + 1), nextDueAt }, now)).toBe(nextDueAt)
    expect(dueTimeAfterOpening({ lastOpenedAt: iso(now - 1000), nextDueAt: null }, now)).toBeNull()
  })
})
