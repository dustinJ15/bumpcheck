/**
 * Server actions for email alerts (stories 37, 38, 44).
 *
 *   set-alerts             turn a project's alerts on or off. Off by default.
 *   send-test-email        "Send me a test": one test email for a project.
 *   test-email-allowance   how many test emails the caller may still send today.
 *
 * The first two start with the ownership check (./own-project.ts): someone
 * else's project gets the same "not found" answer as one that does not exist.
 *
 * No action takes an address. The recipient of every email is the address
 * the caller signs in with, which the alert step reads on the server from
 * the platform's record of the user (src/engine/alert.ts).
 *
 * A test email costs the app owner one email, so it is capped per user per
 * UTC day (`LIMITS.testEmailsPerUserPerDay`; the app owner is exempt). The
 * count is kept as one row per email in the server-only `attempts`
 * collection, the same way add-project attempts are counted.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { LIMITS } from '../config'
import { testEmailsLeft, utcDay } from '../core/limits'
import { sendTestEmail, type TestEmailCount } from '../engine/alert'
import { buildAlertServices } from '../services/wire'
import { loadOwnProject } from './own-project'

export const setAlerts: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer

  const enabled = params.enabled
  if (typeof enabled !== 'boolean') return { success: false, error: 'Alerts are either on or off.', code: 'bad-setting' }

  const updated = await tools.update('projects', own.project.id, { alertsEnabled: enabled })
  if (!updated.success) {
    return { success: false, error: `Could not turn alerts ${enabled ? 'on' : 'off'}. Try again.` }
  }
  return { success: true, data: { alertsEnabled: enabled } }
}

export const sendTestEmailAction: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer

  try {
    const result = await sendTestEmail(buildAlertServices(env, tools), {
      projectId: own.project.id,
      isAppOwner: userId === env.OWNER_USER_ID,
      count: testEmailCountOf(tools, userId, utcDay(Date.now())),
    })
    if (!result.ok) {
      return { success: false, error: result.message, code: result.refusal, details: { remaining: result.remaining } }
    }
    return { success: true, data: { remaining: result.remaining } }
  } catch {
    // The count or the project could not be read. Nothing was sent.
    return { success: false, error: 'Could not send the test email. Try again.' }
  }
}

export const testEmailAllowance: ActionHandler<Env> = async ({ userId, tools, env }) => {
  try {
    const testEmailsToday = await testEmailCountOf(tools, userId, utcDay(Date.now())).countToday()
    return {
      success: true,
      data: {
        // Null for the app owner, who has no limit.
        remaining: testEmailsLeft({ testEmailsToday, isAppOwner: userId === env.OWNER_USER_ID }),
        perDay: LIMITS.testEmailsPerUserPerDay,
      },
    }
  } catch {
    return { success: false, error: 'Could not read your test email allowance.' }
  }
}

/** The kind of `attempts` row a test email is counted as (src/schemas/attempts-schema.ts). */
const TEST_EMAIL_ATTEMPT = 'test-email'

/**
 * The caller's test emails for one UTC day, one row each. Counting rows
 * after writing one is what makes the cap hold for requests sent at the
 * same moment. Throws if the rows cannot be read or written: an email that
 * cannot be counted is not sent.
 */
function testEmailCountOf(tools: ActionTools, userId: string, day: string): TestEmailCount {
  async function countToday(): Promise<number> {
    // Two past the cap is enough to know the answer, however many rows there are.
    const rows = await tools.query('attempts', {
      where: { userId, day, kind: TEST_EMAIL_ATTEMPT },
      limit: LIMITS.testEmailsPerUserPerDay + 2,
    })
    if (!rows.success) throw new Error(`could not count test emails: ${rows.error}`)
    return rows.data.records.length
  }
  return {
    countToday,
    async record() {
      const created = await tools.create('attempts', { userId, day, kind: TEST_EMAIL_ATTEMPT })
      if (!created.success) throw new Error(`could not count a test email: ${created.error}`)
      return countToday()
    },
  }
}
