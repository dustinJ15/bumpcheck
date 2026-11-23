/**
 * Background-job handler: invoked by AppJobRoom (worker.ts) for every job
 * picked up from the queue. A returned value is the job's result; a thrown
 * error fails the attempt, and the room retries until `maxAttempts`.
 *
 * bumpcheck has one job type, `scan`. Its payload is only a project id and
 * the on-demand flag (src/server/scan-queue.ts). The work is in
 * src/engine/scan-job.ts, which has no platform code and is unit-tested:
 *
 *   1. Start from the saved checkpoint if a previous run left one, else fresh.
 *   2. Run one tick: engine steps until the scan is done or the tick's budget
 *      of outbound calls is used.
 *   3. If it says "continue" (budget used, or a failed tick being retried),
 *      save the checkpoint with `ctx.continue`; the room calls back later.
 *   4. If it says "finish", return a small summary.
 *
 * The handler does not throw for a failed scan: the engine layer has already
 * written the failure to the project row, where the user sees it, and
 * throwing would make the job room retry on its own count.
 *
 * The services are real or fake depending on the one setting
 * (src/services/wire.ts). The job runs as the app owner: records are written
 * with owner context and every paid call bills the owner.
 *
 * Jobs are enqueued by server code only (`enqueueScan`). The room refuses
 * enqueue from every client but the app owner.
 */

import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { runScanJobRun, startScanCheckpoint, type ScanCheckpoint } from './engine/scan-job'
import { ownerActionTools } from './server/action-routes'
import { SCAN_JOB_TYPE, type ScanJobPayload } from './server/scan-queue'
import { buildScanServices } from './services/wire'

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  switch (job.type) {
    case SCAN_JOB_TYPE:
      return runScanJob(job, ctx, env)
    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}

async function runScanJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  const payload = readScanPayload(job.payload)
  if (payload === null) {
    // A bug in server code, not something a retry can fix: end the job here.
    return { outcome: 'failed', reason: 'scan job payload must be { projectId: string, onDemand: boolean }' }
  }
  const services = buildScanServices(env, ownerActionTools(env))

  // `resumeFrom` is the checkpoint this handler saved on its previous run.
  const checkpoint =
    (job.resumeFrom as ScanCheckpoint | undefined) ?? startScanCheckpoint(payload.projectId, payload.onDemand)

  const run = await runScanJobRun(services, checkpoint, {
    mayRunAgain: job.attempts < job.maxAttempts,
    isCancelled: () => ctx.signal.aborted,
  })

  if (run.next === 'continue') {
    ctx.continue(run.checkpoint, { afterMs: run.afterMs })
    return
  }
  // The job's result, for the owner's eyes in the job room. Users read the project row.
  return { outcome: run.outcome, reason: run.reason, report: run.report }
}

/** A payload is exactly a project id and the on-demand flag. Null for anything else. */
function readScanPayload(payload: unknown): ScanJobPayload | null {
  const value = payload as Partial<ScanJobPayload> | null
  if (typeof value?.projectId !== 'string' || value.projectId === '' || typeof value.onDemand !== 'boolean') {
    return null
  }
  return { projectId: value.projectId, onDemand: value.onDemand }
}
