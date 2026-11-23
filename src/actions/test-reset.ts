/**
 * Test-only server actions.
 *
 * `test-reset-my-projects`: delete the caller's own projects.
 *
 * The local record room keeps its data between test runs, and there is no
 * "delete project" action until ticket 06, so the browser tests call this
 * first to start from an empty list.
 *
 * It answers "Action not found" unless the fake-services setting is on, and
 * that setting exists only on the local test server: a production build
 * never has it (src/services/mode.ts, proven by mode.test.ts). Even there it
 * can only delete rows owned by the verified caller.
 *
 * `test-reset-fake-world`: delete the shared rows the fake world produced,
 * which are the verdicts of the fake packages and today's AI-call count.
 * Verdicts are a cache that is never judged twice, so without this a test
 * would find the verdicts an earlier test (or an earlier run) left behind,
 * and enough runs in one day would reach the daily AI ceiling. It refuses in
 * the same way unless the fake-services setting is on, and it names only the
 * fake packages (`@bumpcheck-fake/...`), so it cannot touch a real verdict.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { utcDay } from '../core/limits'
import { FAKE_PACKAGE_NAMES } from '../services/fake-world'
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

export const testResetFakeWorld: ActionHandler<Env> = async ({ tools, env }) => {
  if (servicesMode(env) !== 'fake') return { success: false, error: 'Action not found' }

  let deleted = 0
  for (const packageName of FAKE_PACKAGE_NAMES) {
    const batch = await tools.deleteWhere('verdicts', { packageName })
    if (!batch.success) return { success: false, error: batch.error }
    deleted += batch.data.deleted
  }
  const usage = await tools.deleteWhere('usage', { day: utcDay(Date.now()) })
  if (!usage.success) return { success: false, error: usage.error }
  return { success: true, data: { deleted } }
}
