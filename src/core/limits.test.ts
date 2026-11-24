import { describe, expect, it } from 'vitest'
import { LIMITS, SCHEDULE } from '../config'
import {
  isDailyCeilingReached,
  isProjectDue,
  isoToTime,
  isProjectIdle,
  isScanStalled,
  mayAddProject,
  mayAlertToday,
  mayAttemptAddProject,
  mayJudgeAnother,
  maySendTestEmail,
  mayTryAlertAgain,
  nextDueTime,
  nextUtcDayStart,
  scanNowCooldown,
  testEmailsLeft,
  utcDay,
  waitUntilNextUtcDay,
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
  it('is due when it has no due time yet (never scanned)', () => {
    expect(isProjectDue({ nextDueAt: null, now })).toBe(true)
  })

  it('is due 24 hours after its last scan ended, not a millisecond before', () => {
    const scanEndedAt = now - LIMITS.rescanIntervalMs
    expect(isProjectDue({ nextDueAt: nextDueTime(scanEndedAt + 1), now })).toBe(false)
    expect(isProjectDue({ nextDueAt: nextDueTime(scanEndedAt), now })).toBe(true)
    expect(LIMITS.rescanIntervalMs).toBe(24 * 60 * 60 * 1000)
  })

  it('is due exactly at its due time, and after it', () => {
    expect(isProjectDue({ nextDueAt: now + 1, now })).toBe(false)
    expect(isProjectDue({ nextDueAt: now, now })).toBe(true)
    expect(isProjectDue({ nextDueAt: now - 1, now })).toBe(true)
  })
})

describe('nextDueTime', () => {
  it('is the re-scan interval after the scan ended', () => {
    expect(nextDueTime(now)).toBe(now + LIMITS.rescanIntervalMs)
  })
})

describe('mayAttemptAddProject: add-project attempts per user per day', () => {
  it('allows the 20th attempt of the day and refuses the 21st', () => {
    expect(mayAttemptAddProject({ attemptsToday: LIMITS.addAttemptsPerUserPerDay - 1, isAppOwner: false })).toBe(true)
    expect(mayAttemptAddProject({ attemptsToday: LIMITS.addAttemptsPerUserPerDay, isAppOwner: false })).toBe(false)
    expect(LIMITS.addAttemptsPerUserPerDay).toBe(20)
  })

  it('exempts the app owner (a per-user limit)', () => {
    expect(mayAttemptAddProject({ attemptsToday: LIMITS.addAttemptsPerUserPerDay, isAppOwner: true })).toBe(true)
    expect(mayAttemptAddProject({ attemptsToday: LIMITS.addAttemptsPerUserPerDay + 100, isAppOwner: true })).toBe(true)
  })
})

describe('isScanStalled: a scan with no sign of life', () => {
  it('is stalled at 30 minutes without a sign of life, not a millisecond before', () => {
    expect(isScanStalled({ lastSignOfLifeAt: now - SCHEDULE.stalledScanMs + 1, now })).toBe(false)
    expect(isScanStalled({ lastSignOfLifeAt: now - SCHEDULE.stalledScanMs, now })).toBe(true)
    expect(SCHEDULE.stalledScanMs).toBe(30 * 60 * 1000)
  })

  it('is stalled when no sign of life was ever recorded', () => {
    expect(isScanStalled({ lastSignOfLifeAt: null, now })).toBe(true)
  })
})

describe('nextUtcDayStart: when daily counters reset', () => {
  it('is the next midnight UTC', () => {
    expect(nextUtcDayStart(Date.parse('2026-11-23T12:00:00.000Z'))).toBe(Date.parse('2026-11-24T00:00:00.000Z'))
    expect(nextUtcDayStart(Date.parse('2026-11-23T23:59:59.999Z'))).toBe(Date.parse('2026-11-24T00:00:00.000Z'))
    expect(nextUtcDayStart(Date.parse('2026-11-24T00:00:00.000Z'))).toBe(Date.parse('2026-11-25T00:00:00.000Z'))
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

describe('isoToTime', () => {
  it('reads a stored ISO time, and is null for a missing or unreadable one', () => {
    expect(isoToTime('2026-11-23T12:00:00.000Z')).toBe(now)
    expect(isoToTime(null)).toBeNull()
    expect(isoToTime(undefined)).toBeNull()
    expect(isoToTime('')).toBeNull()
    expect(isoToTime('yesterday-ish')).toBeNull()
  })
})

describe('maySendTestEmail: test emails per user per day', () => {
  it('allows the 3rd of the day and refuses the 4th', () => {
    expect(maySendTestEmail({ testEmailsToday: LIMITS.testEmailsPerUserPerDay - 1, isAppOwner: false })).toBe(true)
    expect(maySendTestEmail({ testEmailsToday: LIMITS.testEmailsPerUserPerDay, isAppOwner: false })).toBe(false)
    expect(LIMITS.testEmailsPerUserPerDay).toBe(3)
  })

  it('exempts the app owner (a per-user limit)', () => {
    expect(maySendTestEmail({ testEmailsToday: LIMITS.testEmailsPerUserPerDay + 50, isAppOwner: true })).toBe(true)
  })

  it('says how many are left: 3, 2, 1, 0, never below, and no number for the app owner', () => {
    expect([0, 1, 2, 3, 9].map((testEmailsToday) => testEmailsLeft({ testEmailsToday, isAppOwner: false }))).toEqual([3, 2, 1, 0, 0])
    expect(testEmailsLeft({ testEmailsToday: 9, isAppOwner: true })).toBeNull()
  })
})

describe('mayAlertToday: alert emails per project per day', () => {
  it('allows the first alert of the day and refuses a second', () => {
    expect(mayAlertToday({ alertsSentToday: LIMITS.alertEmailsPerProjectPerDay - 1 })).toBe(true)
    expect(mayAlertToday({ alertsSentToday: LIMITS.alertEmailsPerProjectPerDay })).toBe(false)
    expect(LIMITS.alertEmailsPerProjectPerDay).toBe(1)
  })
})

describe('mayTryAlertAgain: a failed alert is retried once', () => {
  it('allows the first send and one retry, then no more', () => {
    expect(mayTryAlertAgain({ failedSends: 0 })).toBe(true)
    expect(mayTryAlertAgain({ failedSends: LIMITS.alertSendAttemptsPerVerdict - 1 })).toBe(true)
    expect(mayTryAlertAgain({ failedSends: LIMITS.alertSendAttemptsPerVerdict })).toBe(false)
    expect(LIMITS.alertSendAttemptsPerVerdict).toBe(2)
  })
})

describe('waitUntilNextUtcDay: how long until the daily counters reset, in words', () => {
  it('counts in hours, rounded up, when it is an hour or more', () => {
    expect(waitUntilNextUtcDay(Date.parse('2026-11-23T12:00:00.000Z'))).toBe('12 hours')
    expect(waitUntilNextUtcDay(Date.parse('2026-11-23T22:30:00.000Z'))).toBe('2 hours')
    expect(waitUntilNextUtcDay(Date.parse('2026-11-23T23:00:00.000Z'))).toBe('1 hour')
  })

  it('counts in minutes inside the last hour', () => {
    expect(waitUntilNextUtcDay(Date.parse('2026-11-23T23:30:00.000Z'))).toBe('30 minutes')
    expect(waitUntilNextUtcDay(Date.parse('2026-11-23T23:59:00.000Z'))).toBe('1 minute')
  })
})
