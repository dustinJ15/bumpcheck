/**
 * Enqueueing a scan job. Server code only.
 *
 * The job room refuses enqueue, cancel and retry from every client except
 * the app owner (worker.ts), so this function is the way a scan starts: a
 * server action checks the caller and the limits, then calls it. It reaches
 * the room through the worker's own binding, which no browser can do.
 *
 * The payload is only a project id and the on-demand flag (decision 19 in
 * the ledger). Everything else the job needs, it reads from the project row.
 *
 * All scans go to the one job room, where jobs run one at a time. The daily
 * AI-call counter relies on that (src/services/record-room-store.ts).
 */

import { enqueueJob } from 'deepspace/worker'
import type { Env } from '../../worker'
import { SCAN_PACING } from '../config'

export const SCAN_JOB_TYPE = 'scan'

export interface ScanJobPayload {
  projectId: string
  /** True for a "check this one" read (ticket 03). On-demand scans never send alerts. */
  onDemand: boolean
}

/** Returns the new job's id. `requestedBy` is recorded on the job for the owner's eyes. */
export async function enqueueScan(env: Env, payload: ScanJobPayload, requestedBy: string): Promise<string> {
  return enqueueJob(env.JOB_ROOMS, `app:${env.DEEPSPACE_APP_ID}`, SCAN_JOB_TYPE, payload, {
    // The room counts every run of the handler as an attempt, including each
    // resumed tick, so this is a cap on runs, not the retry rule. The retry
    // rule (one retry) is kept by the handler itself: see src/jobs.ts.
    maxAttempts: SCAN_PACING.jobRunsPerScan,
    enqueuedBy: requestedBy,
  })
}
