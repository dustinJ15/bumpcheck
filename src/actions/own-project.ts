/**
 * The first step of every project action: is this the caller's project?
 *
 * The record tools an action gets skip the record room's permission checks
 * (src/server/action-routes.ts explains why), so an action that took a
 * project id from the request and used it would let any signed-in user act
 * on any project. `loadOwnProject` loads the row and compares its owner with
 * the verified caller before the action does anything else.
 *
 * A project that does not exist and a project that belongs to someone else
 * get the same answer, so the action cannot be used to find out which
 * project ids exist.
 */

import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { DependencyResult, ScanStatus, Verdict } from '../core/model'
import { readJson } from '../lib/json'

/** The parts of a project row the project-page actions use. */
export interface OwnProject {
  id: string
  dependencies: DependencyResult[]
  scanStatus: ScanStatus
  reviewedKeys: string[]
}

export const PROJECT_NOT_FOUND: ActionResult<never> = {
  success: false,
  error: 'Project not found.',
  code: 'project-not-found',
}

export async function loadOwnProject(
  tools: ActionTools,
  userId: string,
  /** Straight from the request: not trusted to be a string. */
  projectId: unknown,
): Promise<{ ok: true; project: OwnProject } | { ok: false; answer: ActionResult<never> }> {
  if (typeof projectId !== 'string' || projectId === '') return { ok: false, answer: PROJECT_NOT_FOUND }

  const found = await tools.get('projects', projectId)
  if (!found.success) return { ok: false, answer: PROJECT_NOT_FOUND }

  const data = found.data.record.data
  // The ownership check. `userId` is the verified caller, never a parameter.
  if (data.userId !== userId) return { ok: false, answer: PROJECT_NOT_FOUND }

  return {
    ok: true,
    project: {
      id: projectId,
      dependencies: readJson<DependencyResult[]>(data.dependencies) ?? [],
      scanStatus: (typeof data.scanStatus === 'string' ? data.scanStatus : 'idle') as ScanStatus,
      reviewedKeys: readJson<string[]>(data.reviewedKeys) ?? [],
    },
  }
}

/** What the actions need to know about a stored verdict. */
export type StoredVerdict = Pick<Verdict, 'status' | 'fromVersion'>

/**
 * The shared verdict with this key: null when there is none. Throws if the
 * verdicts cannot be read, so an action never mistakes "could not look" for
 * "no verdict"; `answerUnreadable` turns that into an answer for the user.
 */
export async function loadVerdict(tools: ActionTools, key: string): Promise<StoredVerdict | null> {
  const found = await tools.query<StoredVerdict>('verdicts', { where: { key }, limit: 1 })
  if (!found.success) throw new Error(`could not read verdict ${key}: ${found.error}`)
  const data = found.data.records[0]?.data
  return data === undefined ? null : { status: data.status, fromVersion: String(data.fromVersion) }
}

export const VERDICT_UNREADABLE: ActionResult<never> = {
  success: false,
  error: 'Could not read the verdict. Try again.',
}
