/**
 * The schedule: which projects the hourly task should act on.
 *
 * The task itself (src/cron.ts, through src/engine/schedule.ts) only loads
 * the projects, calls these, and enqueues. The decisions are here, pure and
 * unit-tested, built on the yes/no rules in ./limits.ts:
 *
 *   - `selectDueProjects`: due, not idle, not already scanning, at most a
 *     bounded number per run (decision 9);
 *   - `selectStalledScans`: "queued" or "scanning" for too long with no sign
 *     of life, so the task can mark them failed;
 *   - `dueTimeAfterOpening`: opening an idle project makes it due (story 30).
 *
 * Times on a project row are ISO text; null means "never".
 *
 * Pure: no I/O, no platform imports.
 */

import { SCHEDULE } from '../config'
import { isoToTime, isProjectDue, isProjectIdle, isScanStalled } from './limits'
import type { ScanStatus } from './model'

/** The parts of a project row the schedule looks at. */
export interface SchedulableProject {
  id: string
  scanStatus: ScanStatus
  /** When the next daily scan is due. Null: never scanned, so due. */
  nextDueAt: string | null
  /** When the owner last opened the project's page. */
  lastOpenedAt: string | null
  /** When the project's scan was queued or last wrote progress. */
  scanHeartbeatAt: string | null
  /** Not empty while an on-demand check is queued or running. */
  checkRequests: string[]
}

/**
 * The ids of the projects to scan in this run of the task: due, not idle,
 * not already queued or scanning. At most `bound`, the most overdue first
 * (never-scanned projects before those), so a long backlog drains in order.
 */
export function selectDueProjects(
  projects: readonly SchedulableProject[],
  now: number,
  bound: number = SCHEDULE.scansPerTick,
): string[] {
  return projects
    .filter((project) => !isScanActive(project))
    .filter((project) => isProjectDue({ nextDueAt: isoToTime(project.nextDueAt), now }))
    .filter((project) => !isIdle(project, now))
    .sort((a, b) => (isoToTime(a.nextDueAt) ?? 0) - (isoToTime(b.nextDueAt) ?? 0))
    .slice(0, Math.max(0, bound))
    .map((project) => project.id)
}

/** Projects whose scan is queued or running but has shown no sign of life for the stall time. */
export function selectStalledScans(projects: readonly SchedulableProject[], now: number): SchedulableProject[] {
  return projects.filter(
    (project) => isScanActive(project) && isScanStalled({ lastSignOfLifeAt: isoToTime(project.scanHeartbeatAt), now }),
  )
}

/**
 * The due time a project should have once its owner has opened it. An idle
 * project becomes due now, so the next run of the task scans it and daily
 * scans resume without another click. Any other project keeps its due time.
 */
export function dueTimeAfterOpening(
  project: Pick<SchedulableProject, 'lastOpenedAt' | 'nextDueAt'>,
  now: number,
): string | null {
  return isIdle(project, now) ? new Date(now).toISOString() : project.nextDueAt
}

function isScanActive(project: Pick<SchedulableProject, 'scanStatus'>): boolean {
  return project.scanStatus === 'queued' || project.scanStatus === 'scanning'
}

/** A project that was never opened counts as idle: nobody is reading it. */
function isIdle(project: Pick<SchedulableProject, 'lastOpenedAt'>, now: number): boolean {
  const lastOpenedAt = isoToTime(project.lastOpenedAt)
  return lastOpenedAt === null || isProjectIdle({ lastOpenedAt, now })
}
