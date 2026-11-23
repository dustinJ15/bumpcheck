/**
 * Limits: pure yes/no decisions over counts and timestamps.
 *
 * Every number comes from src/config.ts. Times are epoch milliseconds.
 *
 * The app owner is exempt from per-user limits (projects per user, test
 * emails per user) and from nothing else: not the per-scan cap, not the
 * daily AI ceiling, not the "scan now" cooldown, not the schedule
 * (decision 8, spec "Limits and caps").
 */

import { LIMITS } from '../config'

/** May this user add another project? */
export function mayAddProject(input: { projectCount: number; isAppOwner: boolean }): boolean {
  if (input.isAppOwner) return true
  return input.projectCount < LIMITS.projectsPerUser
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

/** Is a project due for its daily scan? A project never scanned is due. */
export function isProjectDue(input: { lastScanAt: number | null; now: number }): boolean {
  if (input.lastScanAt === null) return true
  return input.now - input.lastScanAt >= LIMITS.rescanIntervalMs
}

/** Has a project gone idle (its owner has not opened it for the idle period)? */
export function isProjectIdle(input: { lastOpenedAt: number; now: number }): boolean {
  return input.now - input.lastOpenedAt >= LIMITS.idlePauseMs
}

/** The UTC day a timestamp falls on, as YYYY-MM-DD. Daily counters are keyed by it. */
export function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}
