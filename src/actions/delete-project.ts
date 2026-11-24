/**
 * Server action: delete a project (story 51).
 *
 * The project must be the caller's (./own-project.ts): someone else's
 * project gets the same "not found" answer as one that does not exist.
 * What is deleted, in which order, and what stays is in
 * src/server/delete-project.ts.
 *
 * Costs nothing: no scan, no integration call.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { ownerActionTools } from '../server/action-routes'
import { deleteProjectRecords } from '../server/delete-project'
import { loadOwnProject } from './own-project'

export const deleteProject: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer

  const deleted = await deleteProjectRecords({ caller: tools, owner: ownerActionTools(env) }, { projectId: own.project.id, userId })
  if (!deleted.ok) return { success: false, error: 'Could not delete the project. Try again.' }
  return { success: true, data: { projectId: own.project.id } }
}
