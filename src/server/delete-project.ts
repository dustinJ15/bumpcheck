/**
 * Deleting a project's records. Server code only; the server action in
 * src/actions/delete-project.ts checks that the project is the caller's and
 * then calls this.
 *
 *   1. Take it out of public view: set it private, then bring its public
 *      report in line (./public-report.ts), which removes the report. This
 *      goes first so that no failure further down can leave a deleted
 *      project's report readable at its share link. A scan that ends while
 *      this runs syncs too, sees "private", and removes the report as well.
 *   2. Delete the project's send log.
 *   3. Delete the project row. That frees one of the user's project slots.
 *
 * What stays: the shared verdicts (they belong to every project with the
 * same upgrade), and the day's counted attempts (deleting a project must
 * not reset the test-email or add-project allowance).
 *
 * If a step fails this stops and says so. Every step is safe to repeat, so
 * pressing delete again starts from the top.
 */

import type { ActionTools } from 'deepspace/worker'
import { syncPublicReport } from './public-report'

export type DeleteTools = Pick<ActionTools, 'get' | 'create' | 'update' | 'remove' | 'deleteWhere'>

export async function deleteProjectRecords(
  tools: {
    /** The caller's record tools. */
    caller: DeleteTools
    /** The app owner's: the public report is written and removed as the app owner, like everywhere else. */
    owner: DeleteTools
  },
  project: { projectId: string; userId: string },
): Promise<{ ok: boolean }> {
  const { projectId, userId } = project

  const hidden = await tools.caller.update('projects', projectId, { visibility: 'private' })
  if (!hidden.success) return { ok: false }
  const unpublished = await syncPublicReport(tools.owner, projectId)
  if (!unpublished.ok) return { ok: false }

  // A batch at a time until none are left. Scoped to the caller as well as
  // the project: these tools would delete anyone's rows.
  for (;;) {
    const batch = await tools.caller.deleteWhere('alerts', { projectId, userId })
    if (!batch.success) return { ok: false }
    if (batch.data.deleted === 0) break
  }

  const removed = await tools.caller.remove('projects', projectId)
  return { ok: removed.success }
}
