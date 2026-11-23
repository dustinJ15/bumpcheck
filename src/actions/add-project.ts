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
 *      project limit, then the repo itself. Each refusal has its own message.
 *   3. Create the project row, owned by the caller, private, status "queued".
 *   4. Count the caller's projects again, and take the row back if requests
 *      sent at the same time put them over the limit.
 *   5. Enqueue its first scan (story 10).
 *
 * Clients cannot create project rows themselves (the schema denies it), so
 * this is the only way a project comes to exist.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { ScanStatus } from '../core/model'
import { mayAddProject } from '../core/limits'
import { checkNewProject, duplicateMessage, PROJECT_LIMIT_MESSAGE } from '../engine/add-project'
import { enqueueScan } from '../server/scan-queue'
import { buildSourceHost } from '../services/wire'

export const addProject: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const mine = await tools.query<{ repoOwner: string; repoName: string }>('projects', { where: { userId } })
  if (!mine.success) return { success: false, error: 'Could not load your projects. Try again.' }

  const isAppOwner = userId === env.OWNER_USER_ID
  const check = await checkNewProject(
    {
      repoInput: params.repo,
      isAppOwner,
      existing: mine.data.records.map((record) => ({ owner: record.data.repoOwner, repo: record.data.repoName })),
    },
    buildSourceHost(env, tools),
  )
  if (!check.ok) return { success: false, error: check.message, code: check.refusal }

  const now = new Date().toISOString()
  const scanStatus: ScanStatus = 'queued'
  const created = await tools.create('projects', {
    userId,
    visibility: 'private',
    // Lowercase (the check returns it so): the schema's unique rule on
    // userId + repoOwner + repoName compares exact strings.
    repoOwner: check.repo.owner,
    repoName: check.repo.repo,
    defaultBranch: check.defaultBranch,
    scanStatus,
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
