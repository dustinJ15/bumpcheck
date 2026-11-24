/**
 * Test-only server actions. Every one answers "Action not found" unless the
 * fake-services setting is on, and that setting exists only on the local
 * test server: a production build never has it (src/services/mode.ts,
 * proven by mode.test.ts).
 *
 * `test-reset-my-projects`: delete the caller's own projects, their public
 * reports, the caller's send log, the caller's counted attempts (add-project
 * attempts and test emails: the browser tests use far more than a day's
 * allowance), and the fake mail addressed to the caller. It also removes
 * the example fixture (below).
 *
 * The local record room keeps its data between test runs, so the browser
 * tests call this first to start from an empty list. The real "delete
 * project" action is not used for this: it deliberately keeps the day's
 * attempt counts.
 *
 * `test-read-outbox` (ticket 06): the messages the fake mailer "sent" to
 * the caller, oldest first. On the local test server no email leaves the
 * machine; each one is written to the server-only `outbox` collection
 * (src/services/outbox-mailer.ts). This is how a browser test reads an
 * email and follows its unsubscribe link. It returns only mail addressed to
 * the caller's own sign-in address.
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
 *
 * `test-publish-example` (ticket 05): the landing page links to one public
 * example report, whose id is a constant (src/config.ts). On the local test
 * server no project has that id, so this copies the public report of one of
 * the caller's own projects under the example id. That copy is the "local
 * fixture" the landing page's link opens in the browser tests.
 *
 * Added for scheduling and limits (ticket 04), because a browser test cannot
 * wait a day, ten minutes, or an hour:
 *
 * `test-set-project-times`: set the time columns of one of the caller's own
 * projects (when it is next due, when a scan was last requested, when it
 * was last opened), so a test can make a project due or end its cooldown.
 * It changes nothing else.
 *
 * `test-use-up-daily-ai-limit`: set today's AI-call count to the daily
 * ceiling, so a test can see what a scan does when the app has reached it.
 *
 * `test-run-scheduled-task`: ask the cron room to run the scheduled task
 * now, the way the app owner's "trigger" does. The cron room accepts a
 * trigger only from the owner (src/server/realtime-routes.ts) and the tests
 * have no owner account, so this sends the platform's own `cron.trigger`
 * message from server code with the owner's identity. It does nothing but
 * trigger the task; what runs is the real path: cron room, `runTask`,
 * `enqueueScan`, job room.
 */

import { clientBuild } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { EXAMPLE_PROJECT_ID, LIMITS, SCHEDULE } from '../config'
import { utcDay } from '../core/limits'
import { publicReportOf } from '../core/public-report'
import { ownerActionTools } from '../server/action-routes'
import { PUBLIC_REPORTS, removeReport, writeReport } from '../server/public-report'
import { FAKE_PACKAGE_NAMES } from '../services/fake-world'
import { servicesMode } from '../services/mode'
import { OUTBOX } from '../services/outbox-mailer'
import { RecordRoomStore } from '../services/record-room-store'
import { readJson } from '../lib/json'
import { loadOwnProject } from './own-project'

export const testResetMyProjects: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (servicesMode(env) !== 'fake') return { success: false, error: 'Action not found' }

  // The public reports first, while the project rows still say which ones there are.
  const mine = await tools.query('projects', { where: { userId } })
  if (!mine.success) return { success: false, error: mine.error }
  for (const reportId of [...mine.data.records.map((record) => record.recordId), EXAMPLE_PROJECT_ID]) {
    const removed = await removeReport(tools, reportId)
    if (!removed.ok) return { success: false, error: removed.error }
  }

  // And any public report whose project no longer exists, whoever's it was.
  // The app never leaves one (delete removes the report first), but a test
  // run against deliberately broken code can, and it would then be found by
  // every later run.
  const reports = await tools.query(PUBLIC_REPORTS)
  if (!reports.success) return { success: false, error: reports.error }
  for (const report of reports.data.records) {
    if (report.recordId === EXAMPLE_PROJECT_ID) continue
    const project = await tools.get('projects', report.recordId)
    if (!project.success && project.error.startsWith('Record not found')) await removeReport(tools, report.recordId)
  }

  let deleted = 0
  for (;;) {
    const batch = await tools.deleteWhere('projects', { userId })
    if (!batch.success) return { success: false, error: batch.error }
    deleted += batch.data.deleted
    if (batch.data.deleted === 0) break
  }
  // The caller's send log, counted attempts, and fake mail. Each in batches until none are left.
  const address = await new RecordRoomStore(tools).getUserEmail(userId).catch(() => null)
  const leftovers: Array<[string, Record<string, unknown>]> = [
    ['alerts', { userId }],
    ['attempts', { userId }],
    ...(address === null ? [] : ([[OUTBOX, { to: address }]] as Array<[string, Record<string, unknown>]>)),
  ]
  for (const [collection, where] of leftovers) {
    for (;;) {
      const batch = await tools.deleteWhere(collection, where)
      if (!batch.success) return { success: false, error: batch.error }
      if (batch.data.deleted === 0) break
    }
  }
  return { success: true, data: { deleted } }
}

export const testReadOutbox: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (servicesMode(env) !== 'fake') return { success: false, error: 'Action not found' }

  const address = await new RecordRoomStore(tools).getUserEmail(userId).catch(() => null)
  if (address === null) return { success: true, data: { messages: [] } }
  const found = await tools.query<Record<string, unknown>>(OUTBOX, { where: { to: address } })
  if (!found.success) return { success: false, error: found.error }

  const messages = found.data.records
    .map((record) => record.data)
    .sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)))
    .map((data) => ({
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text,
      headers: readJson<Record<string, string>>(data.headers) ?? {},
      replyTo: data.replyTo ?? null,
      sentAt: data.sentAt,
    }))
  return { success: true, data: { messages } }
}

export const testPublishExample: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (servicesMode(env) !== 'fake') return { success: false, error: 'Action not found' }

  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer
  const found = await tools.get('projects', own.project.id)
  if (!found.success) return { success: false, error: found.error }
  const data = found.data.record.data

  const report = publicReportOf({
    id: EXAMPLE_PROJECT_ID,
    repoOwner: String(data.repoOwner),
    repoName: String(data.repoName),
    dependencies: own.project.dependencies,
    scanStatus: own.project.scanStatus,
    lastScanAt: typeof data.lastScanAt === 'string' ? data.lastScanAt : null,
  })
  // Written as the app owner, like every public report (src/server/public-report.ts).
  const written = await writeReport(ownerActionTools(env), EXAMPLE_PROJECT_ID, report)
  if (!written.ok) return { success: false, error: written.error }
  return { success: true, data: { reportId: EXAMPLE_PROJECT_ID } }
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

const SETTABLE_TIMES = ['nextDueAt', 'lastScanRequestedAt', 'lastOpenedAt'] as const

export const testSetProjectTimes: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (servicesMode(env) !== 'fake') return { success: false, error: 'Action not found' }

  const own = await loadOwnProject(tools, userId, params.projectId)
  if (!own.ok) return own.answer

  const changes: Record<string, string> = {}
  for (const column of SETTABLE_TIMES) {
    const value = params[column]
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) changes[column] = new Date(value).toISOString()
  }
  if (Object.keys(changes).length === 0) return { success: false, error: 'No time to set.' }

  const updated = await tools.update('projects', own.project.id, changes)
  if (!updated.success) return { success: false, error: updated.error }
  return { success: true, data: changes }
}

export const testUseUpDailyAiLimit: ActionHandler<Env> = async ({ tools, env }) => {
  if (servicesMode(env) !== 'fake') return { success: false, error: 'Action not found' }

  const day = utcDay(Date.now())
  const aiCalls = LIMITS.aiCallsPerDay
  const existing = await tools.query('usage', { where: { day }, limit: 1 })
  if (!existing.success) return { success: false, error: existing.error }
  const row = existing.data.records[0]
  const written =
    row === undefined ? await tools.create('usage', { day, aiCalls }) : await tools.update('usage', row.recordId, { aiCalls })
  if (!written.success) return { success: false, error: written.error }
  return { success: true, data: { day, aiCalls } }
}

/** How long the action waits for the cron room to say the task has run. */
const TRIGGER_TIMEOUT_MS = 20_000

export const testRunScheduledTask: ActionHandler<Env> = async ({ env }) => {
  if (servicesMode(env) !== 'fake') return { success: false, error: 'Action not found' }

  // Connect to the cron room as the app owner. The identity headers are the
  // ones the worker's own WebSocket route sets after verifying a sign-in.
  const room = env.CRON_ROOMS.get(env.CRON_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  const response = await room.fetch(
    new Request('https://cron-room.internal/ws', {
      headers: { Upgrade: 'websocket', 'x-user-id': roomHeader(env.OWNER_USER_ID), 'x-user-role': roomHeader('admin') },
    }),
  )
  const socket = response.webSocket
  if (!socket) return { success: false, error: 'The cron room did not open a connection.' }
  socket.accept()

  // The room answers a trigger that carries a request id once the task has finished.
  const requestId = crypto.randomUUID()
  const receipt = new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'The cron room did not answer in time.' }), TRIGGER_TIMEOUT_MS)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { type?: string; payload?: { requestId?: string; ok?: boolean; error?: string } }
      if (message.type !== 'cron.ack' || message.payload?.requestId !== requestId) return
      clearTimeout(timer)
      resolve({ ok: message.payload.ok === true, error: message.payload.error })
    })
  })
  socket.send(JSON.stringify(clientBuild.cronTrigger(SCHEDULE.taskName, requestId)))
  const result = await receipt
  socket.close()

  if (!result.ok) return { success: false, error: result.error ?? 'The scheduled task failed.' }
  return { success: true, data: { task: SCHEDULE.taskName } }
}

/** Room identity headers are base64url text (the platform's `authenticatedRoomRequest` writes them so). */
function roomHeader(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
