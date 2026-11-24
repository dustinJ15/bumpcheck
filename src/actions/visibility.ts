/**
 * Server action: set a project private or public (stories 47 and 48).
 *
 *   1. The project must be the caller's (./own-project.ts). Someone else's
 *      project gets the same "not found" answer as one that does not exist.
 *   2. The value must be exactly "private" or "public".
 *   3. Write the owner's choice on the project row.
 *   4. Make the public report match (src/server/public-report.ts): a public
 *      project gets one, a private project's is removed. That removal is
 *      what takes access away: the project row itself is never readable by
 *      anyone but its owner.
 *
 * If step 4 fails, the project row is set back to what it was before this
 * request, so the switch on the settings page never says "private" while
 * the report is still up.
 *
 * Costs nothing: no scan, no integration call.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { readVisibility, type Visibility } from '../core/public-report'
import { ownerActionTools } from '../server/action-routes'
import { syncPublicReport } from '../server/public-report'
import { loadOwnProject } from './own-project'

export const setVisibility: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer
  const projectId = own.project.id

  const visibility = readVisibility(params.visibility)
  if (visibility === null) return { success: false, error: 'A project is either "private" or "public".', code: 'bad-visibility' }

  const updated = await tools.update('projects', projectId, { visibility })
  if (!updated.success) return { success: false, error: COULD_NOT[visibility] }

  // The public report is written as the app owner, not as the caller: a
  // row's `createdBy` is sent to its readers, and must not be the user's id.
  const reportTools = ownerActionTools(env)
  const synced = await syncPublicReport(reportTools, projectId)
  if (!synced.ok) {
    // Back to what the row held before this request (not "the other value":
    // the request may have repeated the current setting).
    await tools.update('projects', projectId, { visibility: own.project.visibility })
    // Bring the report in line with the restored setting; if this fails too, the next scan's sync does it.
    await syncPublicReport(reportTools, projectId)
    return { success: false, error: COULD_NOT[visibility] }
  }

  return { success: true, data: { visibility } }
}

const COULD_NOT: Record<Visibility, string> = {
  public: 'Could not make the report public. Try again.',
  private: 'Could not make the report private. It is still public. Try again.',
}
