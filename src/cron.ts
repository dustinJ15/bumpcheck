/**
 * The scheduled task: registered into the AppCronRoom Durable Object
 * (worker.ts), which calls `runTask` on the schedule declared here and
 * whenever the app owner triggers the task by hand.
 *
 * bumpcheck has one task, run hourly. It is thin on purpose. What it does is
 * in src/engine/schedule.ts, which has no platform code and is unit-tested:
 * mark stalled scans failed, then enqueue a bounded number of scans for the
 * projects that are due. Which projects those are is decided by the pure
 * functions in src/core/schedule.ts.
 *
 * "Daily" comes from each project's own due time, not from this interval:
 * the task runs every hour and picks the projects whose day is up.
 *
 * The task runs as the app owner, like the scan job. It enqueues through
 * `enqueueScan`, the same server-side path the actions use, so the job room
 * stays closed to every client but the owner. It makes no AI call itself:
 * each scan it starts passes the per-scan cap and the daily AI ceiling in
 * the scan engine.
 *
 * Platform facts (checked against the installed deepspace 0.44.2): an
 * interval is a whole number of minutes; the schedule is armed by the app's
 * first request (see `armCronRoom` in worker.ts); an interval task also runs
 * once right after it is first armed.
 */

import type { CronTask } from 'deepspace/worker'
import type { Env } from '../worker'
import { SCHEDULE } from './config'
import { runScheduleTick } from './engine/schedule'
import { ownerActionTools } from './server/action-routes'
import { syncPublicReport } from './server/public-report'
import { enqueueScan } from './server/scan-queue'
import { RecordRoomStore, systemClock } from './services/record-room-store'

export const DAILY_SCANS_TASK = SCHEDULE.taskName

export const tasks: CronTask[] = [{ name: DAILY_SCANS_TASK, intervalMinutes: SCHEDULE.tickIntervalMinutes }]

export async function runTask(name: string, env: Env): Promise<void> {
  if (name !== DAILY_SCANS_TASK) throw new Error(`Unknown scheduled task: ${name}`)

  const tools = ownerActionTools(env)
  const result = await runScheduleTick({
    store: new RecordRoomStore(tools),
    clock: systemClock,
    enqueueScan: async (projectId) => {
      // A scheduled scan is a full scan (never on-demand), so it may alert.
      await enqueueScan(env, { projectId, onDemand: false }, 'schedule')
    },
  })
  // A stalled scan was just marked as ended on its project row. No job will
  // finish for it, so its public report (if the project is public) is brought
  // up to date here, the way the scan job does when a scan ends normally.
  for (const projectId of result.stalled) await syncPublicReport(tools, projectId).catch(() => {})
  console.info(`[cron] ${name}: enqueued ${result.enqueued.length}, stalled ${result.stalled.length}`)
}
