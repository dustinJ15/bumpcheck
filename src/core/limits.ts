/**
 * Limits: pure yes/no decisions over counts and timestamps.
 *
 * Every number comes from src/config.ts. Times are epoch milliseconds.
 *
 * The app owner is exempt from per-user limits (projects per user, add
 * attempts per user, test emails per user) and from nothing else: not the per-scan cap, not the
 * daily AI ceiling, not the "scan now" cooldown, not the schedule
 * (decision 8, spec "Limits and caps").
 */

import { LIMITS, SCHEDULE } from '../config'

/** May this user add another project? */
export function mayAddProject(input: { projectCount: number; isAppOwner: boolean }): boolean {
  if (input.isAppOwner) return true
  return input.projectCount < LIMITS.projectsPerUser
}

/**
 * May this user make another add-project attempt today? `attemptsToday` is
 * how many they have already made. An attempt is a request that reaches
 * GitHub, which costs the owner money even when the repo is then refused.
 */
export function mayAttemptAddProject(input: { attemptsToday: number; isAppOwner: boolean }): boolean {
  if (input.isAppOwner) return true
  return input.attemptsToday < LIMITS.addAttemptsPerUserPerDay
}

/** May this scan ask the judge for another new verdict? */
export function mayJudgeAnother(input: { judgedThisScan: number }): boolean {
  return input.judgedThisScan < LIMITS.newVerdictsPerScan
}

/** Has the app used its AI calls for today? Applies to everyone, the owner included. */
export function isDailyCeilingReached(input: { aiCallsToday: number }): boolean {
  return input.aiCallsToday >= LIMITS.aiCallsPerDay
}

/**
 * Is "scan now" cooling down? `availableAt` is when it can be pressed again,
 * so the page can say so (story 25).
 */
export function scanNowCooldown(input: { lastRequestedAt: number | null; now: number }):
  | { coolingDown: false }
  | { coolingDown: true; availableAt: number } {
  if (input.lastRequestedAt === null) return { coolingDown: false }
  const availableAt = input.lastRequestedAt + LIMITS.scanNowCooldownMs
  return input.now < availableAt ? { coolingDown: true, availableAt } : { coolingDown: false }
}

/**
 * When a project is next due, given when its last full scan ended. Every
 * full scan that ends writes this to the project, whether it succeeded or
 * failed, so a failing project is tried once a day and not once an hour.
 */
export function nextDueTime(scanEndedAt: number): number {
  return scanEndedAt + LIMITS.rescanIntervalMs
}

/** Is a project due for its daily scan? A project with no due time yet (never scanned) is due. */
export function isProjectDue(input: { nextDueAt: number | null; now: number }): boolean {
  if (input.nextDueAt === null) return true
  return input.now >= input.nextDueAt
}

/** Has a project gone idle (its owner has not opened it for the idle period)? */
export function isProjectIdle(input: { lastOpenedAt: number; now: number }): boolean {
  return input.now - input.lastOpenedAt >= LIMITS.idlePauseMs
}

/**
 * Has a queued or running scan stalled? `lastSignOfLifeAt` is when it was
 * queued or last wrote progress. A scan that never recorded one is stalled.
 */
export function isScanStalled(input: { lastSignOfLifeAt: number | null; now: number }): boolean {
  if (input.lastSignOfLifeAt === null) return true
  return input.now - input.lastSignOfLifeAt >= SCHEDULE.stalledScanMs
}

/** The UTC day a timestamp falls on, as YYYY-MM-DD. Daily counters are keyed by it. */
export function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** The start of the next UTC day: when the daily counters reset. */
export function nextUtcDayStart(time: number): number {
  const day = new Date(time)
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1)
}

/**
 * A time stored on a record (ISO text) as epoch milliseconds, which is what
 * the functions above take. Null for a missing or unreadable value.
 */
export function isoToTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  return Number.isNaN(time) ? null : time
}
