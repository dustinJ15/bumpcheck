/**
 * Server action: "scan now". Also what the Retry button on a failed scan calls.
 *
 * A full scan can end in AI calls, so the action does not start one freely:
 *
 *   1. The project must be the caller's (./own-project.ts).
 *   2. The request must pass `checkScanNowRequest` (src/core/requests.ts):
 *      no scan already queued or running for the project, and not inside the
 *      cooldown since the user's last scan request. A refusal for the
 *      cooldown says when "scan now" will be available. Nobody is exempt,
 *      the app owner included.
 *   3. Mark the project "queued" and record the time of this request, which
 *      starts the next cooldown.
 *   4. Enqueue a full scan job.
 *
 * Nothing here calls the judge. The job applies the per-scan cap and the
 * app's daily AI ceiling, as it does for every scan (src/engine/scan.ts).
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { isoToTime } from '../core/limits'
import type { ScanStatus } from '../core/model'
import { checkScanNowRequest } from '../core/requests'
import { queuedFields } from '../engine/scan'
import { enqueueScan } from '../server/scan-queue'
import { loadOwnProject } from './own-project'

export const scanNow: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer
  const project = own.project

  const now = Date.now()
  const check = checkScanNowRequest({
    scanStatus: project.scanStatus,
    lastScanRequestedAt: isoToTime(project.lastScanRequestedAt),
    now,
  })
  if (!check.ok) {
    // For the cooldown the answer also carries the time, so the page can show it in the reader's own time zone.
    const details = check.refusal === 'cooling-down' ? { availableAt: check.availableAt } : undefined
    return { success: false, error: check.message, code: check.refusal, details }
  }

  const queued = await tools.update('projects', project.id, {
    ...queuedFields(now),
    checkRequests: [],
    lastScanRequestedAt: new Date(now).toISOString(),
  })
  if (!queued.success) return { success: false, error: 'Could not start the scan. Try again.' }

  try {
    await enqueueScan(env, { projectId: project.id, onDemand: false }, userId)
  } catch {
    // Nothing was enqueued. Say so on the row, and give the request time
    // back so the cooldown does not block the user's next try.
    await tools.update('projects', project.id, {
      scanStatus: 'failed' satisfies ScanStatus,
      scanError: 'The scan could not be started. Try again later.',
      lastScanRequestedAt: project.lastScanRequestedAt,
    })
    return { success: false, error: 'The scan could not be started. Try again later.' }
  }
  return { success: true, data: { projectId: project.id } }
}
