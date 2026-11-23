/**
 * Server actions: mark a verdict as reviewed, undo it, and record that a
 * project was opened.
 *
 * None of these costs anything. Each one checks that the project is the
 * caller's (./own-project.ts) before it reads or writes anything else.
 *
 * "Reviewed" is per project: the verdict itself is shared by every project
 * and is not changed. The project row keeps the list of reviewed verdict
 * keys, and the page moves those verdicts to its collapsed section
 * (src/core/report.ts).
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { VerdictStatus } from '../core/model'
import { addReviewedKey, removeReviewedKey } from '../core/report'
import { checkReviewRequest } from '../core/requests'
import { loadOwnProject, loadVerdict, PROJECT_NOT_FOUND, VERDICT_UNREADABLE } from './own-project'

export const markReviewed: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer
  const project = own.project

  const verdictKey = params.verdictKey
  let verdictStatus: VerdictStatus | null = null
  try {
    if (typeof verdictKey === 'string' && verdictKey !== '') {
      verdictStatus = (await loadVerdict(tools, verdictKey))?.status ?? null
    }
  } catch {
    return VERDICT_UNREADABLE
  }
  const check = checkReviewRequest({ dependencies: project.dependencies, verdictKey, verdictStatus })
  if (!check.ok) return { success: false, error: check.message, code: check.refusal }
  // The check already refuses anything but a string; this line tells the type checker so.
  if (typeof verdictKey !== 'string') return PROJECT_NOT_FOUND

  const reviewedKeys = addReviewedKey(project.reviewedKeys, verdictKey)
  const updated = await tools.update('projects', project.id, { reviewedKeys })
  if (!updated.success) return { success: false, error: 'Could not mark the verdict as reviewed. Try again.' }
  return { success: true, data: { reviewedKeys } }
}

export const undoReviewed: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer
  const project = own.project

  const verdictKey = params.verdictKey
  if (typeof verdictKey !== 'string' || verdictKey === '') {
    return { success: false, error: "That verdict is not part of this project's report." }
  }

  // Removing a key that is not in the list changes nothing, so no further check is needed.
  const reviewedKeys = removeReviewedKey(project.reviewedKeys, verdictKey)
  const updated = await tools.update('projects', project.id, { reviewedKeys })
  if (!updated.success) return { success: false, error: 'Could not undo. Try again.' }
  return { success: true, data: { reviewedKeys } }
}

/**
 * The owner opened the project's page. Daily scans pause for a project not
 * opened for the idle period (src/core/limits.ts, `isProjectIdle`); this is
 * what resets that timer (story 30).
 */
export const recordOpened: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer

  const updated = await tools.update('projects', own.project.id, { lastOpenedAt: new Date().toISOString() })
  if (!updated.success) return { success: false, error: 'Could not record the visit.' }

  // Answer with what the row now holds, not with what was sent.
  const stored = await tools.get('projects', own.project.id)
  if (!stored.success) return { success: false, error: 'Could not record the visit.' }
  return { success: true, data: { lastOpenedAt: stored.data.record.data.lastOpenedAt } }
}
