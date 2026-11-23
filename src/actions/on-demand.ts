/**
 * Server actions: "check this one" and "retry a failed verdict".
 *
 * Both ask for one dependency of one project to be read by the judge, which
 * is an AI call, so both follow the same steps:
 *
 *   1. The project must be the caller's (./own-project.ts).
 *   2. The request must be one the rules allow (src/core/requests.ts): a
 *      minor or patch upgrade with no verdict covering it for "check", a failed verdict
 *      for "retry", and no other scan running for the project.
 *   3. Record the requested package on the project row (`checkRequests`) and
 *      mark the project "queued". The job payload carries only the project
 *      id and the on-demand flag (ledger item 19), so the row is where the
 *      job finds out what was asked for.
 *   4. Enqueue an on-demand scan job.
 *
 * The job (src/engine/scan.ts, "read-request") judges only that package, and
 * the judge step applies the per-scan cap and the app's daily AI ceiling as
 * it does for every scan. Nothing here calls the judge.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { ScanStatus } from '../core/model'
import { checkOnDemandRequest, type OnDemandKind } from '../core/requests'
import { enqueueScan } from '../server/scan-queue'
import { loadOwnProject, loadVerdict, PROJECT_NOT_FOUND, VERDICT_UNREADABLE, type StoredVerdict } from './own-project'

function onDemandAction(kind: OnDemandKind): ActionHandler<Env> {
  return async ({ userId, params, tools, env }) => {
    const own = await loadOwnProject(tools, userId, params.projectId)
    if (!own.ok) return own.answer
    const project = own.project

    const dependency = project.dependencies.find((dep) => dep.name === params.packageName)
    let verdict: StoredVerdict | null = null
    try {
      if (dependency?.verdictKey !== undefined) verdict = await loadVerdict(tools, dependency.verdictKey)
    } catch {
      return VERDICT_UNREADABLE
    }

    const check = checkOnDemandRequest({ kind, scanStatus: project.scanStatus, dependency, verdict })
    if (!check.ok) return { success: false, error: check.message, code: check.refusal }
    // The check already refuses a missing dependency; this line tells the type checker so.
    if (dependency === undefined) return PROJECT_NOT_FOUND

    const queued = await tools.update('projects', project.id, {
      scanStatus: 'queued' satisfies ScanStatus,
      scanProgress: null,
      scanError: null,
      checkRequests: [dependency.name],
    })
    if (!queued.success) return { success: false, error: 'Could not start the check. Try again.' }

    try {
      await enqueueScan(env, { projectId: project.id, onDemand: true }, userId)
    } catch {
      // Nothing was enqueued: put the project back as it was.
      await tools.update('projects', project.id, { scanStatus: 'done' satisfies ScanStatus, checkRequests: [] })
      return { success: false, error: 'The check could not be started. Try again later.' }
    }
    return { success: true, data: { packageName: dependency.name } }
  }
}

/** Read one minor or patch upgrade (story 17). */
export const checkDependency = onDemandAction('check')

/** Judge a failed verdict again (story 22). */
export const retryVerdict = onDemandAction('retry')
