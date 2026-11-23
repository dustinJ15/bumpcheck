/**
 * Test-only server action: delete the caller's own projects.
 *
 * The local record room keeps its data between test runs, and there is no
 * "delete project" action until ticket 06, so the browser tests call this
 * first to start from an empty list.
 *
 * It answers "Action not found" unless the fake-services setting is on, and
 * that setting exists only on the local test server: a production build
 * never has it (src/services/mode.ts, proven by mode.test.ts). Even there it
 * can only delete rows owned by the verified caller.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { servicesMode } from '../services/mode'

export const testResetMyProjects: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (servicesMode(env) !== 'fake') return { success: false, error: 'Action not found' }

  let deleted = 0
  for (;;) {
    const batch = await tools.deleteWhere('projects', { userId })
    if (!batch.success) return { success: false, error: batch.error }
    deleted += batch.data.deleted
    if (batch.data.deleted === 0) break
  }
  return { success: true, data: { deleted } }
}
