/**
 * Server action: add a project.
 *
 * The caller is `userId`, which the action route took from the platform's
 * verified sign-in token (src/server/action-routes.ts). Nothing in `params`
 * is trusted for identity: the only input read is the repo text.
 *
 * Steps, cheapest first, so a refused request costs nothing:
 *   1. Load the caller's own projects.
 *   2. Run the add-project check (src/engine/add-project.ts): input, duplicate,
 *      project limit, the daily cap on attempts, then the repo itself. Each
 *      refusal has its own message. A request that reaches GitHub is counted
 *      as an attempt first (`attemptsOf` below).
 *   3. Create the project row, owned by the caller, private, status "queued".
 *   4. Count the caller's projects again, and take the row back if requests
 *      sent at the same time put them over the limit.
 *   5. Enqueue its first scan (story 10).
 *
 * Clients cannot create project rows themselves (the schema denies it), so
 * this is the only way a project comes to exist.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { LIMITS } from '../config'
import type { ScanStatus } from '../core/model'
import { mayAddProject, utcDay } from '../core/limits'
import { checkNewProject, duplicateMessage, PROJECT_LIMIT_MESSAGE, type AddAttempts, type NewProjectCheck } from '../engine/add-project'
import { queuedFields } from '../engine/scan'
import { enqueueScan } from '../server/scan-queue'
import { buildSourceHost } from '../services/wire'

export const addProject: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const mine = await tools.query<{ repoOwner: string; repoName: string }>('projects', { where: { userId } })
  if (!mine.success) return { success: false, error: 'Could not load your projects. Try again.' }

  const isAppOwner = userId === env.OWNER_USER_ID
  const nowMs = Date.now()
  let check: NewProjectCheck
  try {
    check = await checkNewProject(
      {
        repoInput: params.repo,
        isAppOwner,
        existing: mine.data.records.map((record) => ({ owner: record.data.repoOwner, repo: record.data.repoName })),
        now: nowMs,
      },
      buildSourceHost(env, tools),
      attemptsOf(tools, userId, utcDay(nowMs)),
    )
  } catch {
    // The attempts could not be counted, or GitHub could not be reached.
    // Either way nothing was added.
    return { success: false, error: 'Could not check the repository. Try again.' }
  }
  if (!check.ok) return { success: false, error: check.message, code: check.refusal }

  const now = new Date(nowMs).toISOString()
  const created = await tools.create('projects', {
    userId,
    visibility: 'private',
    // Lowercase (the check returns it so): the schema's unique rule on
    // userId + repoOwner + repoName compares exact strings.
    repoOwner: check.repo.owner,
    repoName: check.repo.repo,
    defaultBranch: check.defaultBranch,
    // Queued for its first scan. This request starts the "scan now" cooldown.
    ...queuedFields(nowMs),
    lastScanRequestedAt: now,
    lastOpenedAt: now,
  })
  if (!created.success) {
    // Two "add" requests at once: the unique rule stops the second one.
    if (created.error.startsWith('Duplicate')) {
      return { success: false, error: duplicateMessage(check.repo), code: 'duplicate' }
    }
    return { success: false, error: 'Could not create the project. Try again.' }
  }

  const projectId = created.data.recordId

  // The limit was checked before the row existed, so several "add" requests
  // sent at once could each pass it. Count again now that the row is in;
  // if the user is over the limit, take this one back.
  const after = await tools.query('projects', { where: { userId } })
  const countNow = after.success ? after.data.records.length : mine.data.records.length + 1
  if (!mayAddProject({ projectCount: countNow - 1, isAppOwner })) {
    await tools.remove('projects', projectId)
    return { success: false, error: PROJECT_LIMIT_MESSAGE, code: 'project-limit' }
  }

  try {
    await enqueueScan(env, { projectId, onDemand: false }, userId)
  } catch {
    // The project exists but its scan did not start. Say so on the row
    // instead of leaving it "queued" forever.
    await tools.update('projects', projectId, {
      scanStatus: 'failed' satisfies ScanStatus,
      scanError: 'The first scan could not be started. Try again later.',
    })
  }

  return { success: true, data: { projectId } }
}

/**
 * The caller's add-project attempts for one UTC day, kept as one row each in
 * the server-only `attempts` collection. Counting rows after writing one is
 * what makes the cap hold for requests sent at the same moment. Throws if
 * the rows cannot be read or written: an attempt that cannot be counted is
 * not allowed through.
 */
function attemptsOf(tools: ActionTools, userId: string, day: string): AddAttempts {
  async function countToday(): Promise<number> {
    // Two past the cap is enough to know the answer, however many rows there are.
    const rows = await tools.query('attempts', { where: { userId, day }, limit: LIMITS.addAttemptsPerUserPerDay + 2 })
    if (!rows.success) throw new Error(`could not count add attempts: ${rows.error}`)
    return rows.data.records.length
  }
  return {
    countToday,
    async record() {
      const created = await tools.create('attempts', { userId, day })
      if (!created.success) throw new Error(`could not record an add attempt: ${created.error}`)
      return countToday()
    },
  }
}
