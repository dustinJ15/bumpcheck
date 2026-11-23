import { describe, expect, it } from 'vitest'
import { LIMITS } from '../config'
import {
  isDailyCeilingReached,
  isProjectDue,
  isProjectIdle,
  mayAddProject,
  mayJudgeAnother,
  scanNowCooldown,
  utcDay,
} from './limits'

const now = Date.parse('2026-11-23T12:00:00.000Z')

describe('mayAddProject: projects per user', () => {
  it('allows up to the limit and refuses at it', () => {
    expect(mayAddProject({ projectCount: LIMITS.projectsPerUser - 1, isAppOwner: false })).toBe(true)
    expect(mayAddProject({ projectCount: LIMITS.projectsPerUser, isAppOwner: false })).toBe(false)
  })

  it('exempts the app owner (a per-user limit)', () => {
    expect(mayAddProject({ projectCount: LIMITS.projectsPerUser, isAppOwner: true })).toBe(true)
    expect(mayAddProject({ projectCount: LIMITS.projectsPerUser + 10, isAppOwner: true })).toBe(true)
  })

  it('uses the spec value of 3', () => {
    expect(LIMITS.projectsPerUser).toBe(3)
  })
})

describe('mayJudgeAnother: new AI verdicts per scan', () => {
  it('allows the 15th and refuses the 16th', () => {
    expect(mayJudgeAnother({ judgedThisScan: LIMITS.newVerdictsPerScan - 1 })).toBe(true)
    expect(mayJudgeAnother({ judgedThisScan: LIMITS.newVerdictsPerScan })).toBe(false)
    expect(LIMITS.newVerdictsPerScan).toBe(15)
  })
})

describe('isDailyCeilingReached: AI calls per day, app-wide', () => {
  it('is reached at the ceiling, not before', () => {
    expect(isDailyCeilingReached({ aiCallsToday: LIMITS.aiCallsPerDay - 1 })).toBe(false)
    expect(isDailyCeilingReached({ aiCallsToday: LIMITS.aiCallsPerDay })).toBe(true)
    expect(LIMITS.aiCallsPerDay).toBe(150)
  })
})

describe('scanNowCooldown', () => {
  it('is not cooling down when no scan was requested', () => {
    expect(scanNowCooldown({ lastRequestedAt: null, now })).toEqual({ coolingDown: false })
  })

  it('cools down until exactly the cooldown has passed, and says when', () => {
    const lastRequestedAt = now - LIMITS.scanNowCooldownMs + 1
    expect(scanNowCooldown({ lastRequestedAt, now })).toEqual({
      coolingDown: true,
      availableAt: lastRequestedAt + LIMITS.scanNowCooldownMs,
    })
    expect(scanNowCooldown({ lastRequestedAt: now - LIMITS.scanNowCooldownMs, now })).toEqual({
      coolingDown: false,
    })
    expect(LIMITS.scanNowCooldownMs).toBe(10 * 60 * 1000)
  })
})

describe('isProjectDue: re-scan interval', () => {
  it('is due when never scanned', () => {
    expect(isProjectDue({ lastScanAt: null, now })).toBe(true)
  })

  it('is due at 24 hours, not a millisecond before', () => {
    expect(isProjectDue({ lastScanAt: now - LIMITS.rescanIntervalMs + 1, now })).toBe(false)
    expect(isProjectDue({ lastScanAt: now - LIMITS.rescanIntervalMs, now })).toBe(true)
    expect(LIMITS.rescanIntervalMs).toBe(24 * 60 * 60 * 1000)
  })
})

describe('isProjectIdle: idle pause', () => {
  it('goes idle at 7 days without being opened, not a millisecond before', () => {
    expect(isProjectIdle({ lastOpenedAt: now - LIMITS.idlePauseMs + 1, now })).toBe(false)
    expect(isProjectIdle({ lastOpenedAt: now - LIMITS.idlePauseMs, now })).toBe(true)
    expect(LIMITS.idlePauseMs).toBe(7 * 24 * 60 * 60 * 1000)
  })
})

describe('utcDay', () => {
  it('keys daily counters by UTC date', () => {
    expect(utcDay(Date.parse('2026-11-23T23:59:59.999Z'))).toBe('2026-11-23')
    expect(utcDay(Date.parse('2026-11-24T00:00:00.000Z'))).toBe('2026-11-24')
  })
})
