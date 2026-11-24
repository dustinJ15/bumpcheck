/**
 * One run of the scheduled task, minus the platform.
 *
 * The task runs hourly (src/cron.ts). Each run does two things, in this order:
 *
 *   1. Stalled scans. A project that has been "queued" or "scanning" with no
 *      sign of life for the stall time is marked as failed, so it does not
 *      stay stuck: the job room can end a job without calling the handler
 *      (a cancel between ticks, say), and then nothing else resets the row.
 *      A stalled full scan becomes "failed" with a reason. A stalled check
 *      ("check this one", a retry) ends like any failed check: the project
 *      is "done" again and says the last check did not finish.
 *
 *   2. Daily scans. Projects that are due, not idle and not already scanning
 *      are marked "queued" and a scan is enqueued for each, at most
 *      `SCHEDULE.scansPerTick` per run.
 *
 * Which projects, is decided by pure functions in src/core/schedule.ts. This
 * file loads the rows and does the writes. It starts no AI work itself: the
 * scans it enqueues go through the same per-scan cap and daily AI ceiling as
 * every other scan (src/engine/scan.ts).
 *
 * No platform imports, so the tests run it against the in-memory store.
 */

import { selectDueProjects, selectStalledScans } from '../core/schedule'
import type { Clock, RecordStore } from '../services/types'
import { markCheckFailed, markScanFailed, queuedFields } from './scan'

export interface ScheduleServices {
  store: Pick<RecordStore, 'listProjects' | 'updateProject'>
  clock: Clock
  /** Enqueues a full scan of one project. Throws if it could not. */
  enqueueScan(projectId: string): Promise<void>
}

/** What a run did, by project id. Returned for the logs and the tests. */
export interface ScheduleTickResult {
  stalled: string[]
  enqueued: string[]
}

export const STALLED_SCAN_REASON = 'The scan stopped without finishing.'
export const STALLED_CHECK_REASON = 'The check stopped without finishing.'
export const NOT_ENQUEUED_REASON = 'The daily scan could not be started.'

export async function runScheduleTick(services: ScheduleServices): Promise<ScheduleTickResult> {
  const now = services.clock.now()
  const projects = await services.store.listProjects()

  // Each project is handled on its own: a row that cannot be written (it was
  // deleted a moment ago, say) is skipped, and the run goes on to the rest.
  const stalled: string[] = []
  for (const project of selectStalledScans(projects, now)) {
    try {
      // A request on the row means the stalled job was an on-demand check.
      if (project.checkRequests.length > 0) await markCheckFailed(services, project.id, STALLED_CHECK_REASON)
      else await markScanFailed(services, project.id, STALLED_SCAN_REASON)
      stalled.push(project.id)
    } catch {
      // Still stalled; the next run tries again.
    }
  }

  // `projects` is the list as loaded, so a project marked failed just above
  // still reads as queued or scanning here and is not enqueued by this run.
  const enqueued: string[] = []
  for (const projectId of selectDueProjects(projects, now)) {
    try {
      // Marked "queued" first: the page shows it, and "scan now", "check this
      // one" and the next run of this task all see a scan is already on its way.
      await services.store.updateProject(projectId, { ...queuedFields(now), checkRequests: [] })
    } catch {
      continue
    }
    try {
      await services.enqueueScan(projectId)
      enqueued.push(projectId)
    } catch {
      // No job exists, so the row must not stay "queued".
      await markScanFailed(services, projectId, NOT_ENQUEUED_REASON).catch(() => {})
    }
  }

  return { stalled, enqueued }
}
