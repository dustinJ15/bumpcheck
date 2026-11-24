/**
 * Email alerts: the step that runs after a daily scan, and the test email.
 *
 * `runAlertStep` is what the scan engine's alert hook calls once a full
 * scan has written its results (src/engine/scan.ts; never for an on-demand
 * "check this one"). For a project with alerts on it:
 *
 *   1. picks the breaking verdicts that are neither reviewed nor already
 *      alerted (src/core/alert-rules.ts). None: stop, nothing is sent.
 *   2. stops if the project already sent its alert for today
 *      (`mayAlertToday`). The verdicts stay unalerted, so the next day's
 *      scan sends them.
 *   3. composes one email (src/core/alert-email.ts) and hands it to the mailer.
 *   4. writes the outcome to the send log, and on success adds the verdict
 *      keys to the project's `alertedKeys`.
 *
 * Never twice (story 40): step 1 treats a verdict as alerted if either
 * record from step 4 says so, and step 4 attempts both writes even when one
 * fails. A send that failed is not recorded as alerted, so the next scan
 * tries once more; the send log's failed lines are what count the tries.
 *
 * The recipient is the address the project's owner signs in with, read from
 * the platform's own record of the user (`AlertStore.getUserEmail`). No
 * request, parameter or project field can name another address.
 *
 * Nothing is sent unless the email can carry a working unsubscribe link:
 * that needs the signing key and the app's own address. Without either the
 * attempt is logged as failed with the reason, and no mail goes out. Such a
 * line names no verdict, so it does not count as a try at emailing one.
 *
 * `sendTestEmail` is the settings page's "Send me a test" button: the same
 * email, marked as a test, capped per user per day. It changes nothing
 * about what has or has not been alerted.
 *
 * No platform imports: the store, mailer and clock are passed in, so the
 * tests run all of this against the fakes.
 */

import { ALERT_EMAIL, LIMITS } from '../config'
import { composeAlertEmail, SAMPLE_ALERT_ITEM, singleLine, type AlertItem } from '../core/alert-email'
import { alertsSentOn, pickAlertItems, pickTestItems } from '../core/alert-rules'
import { mayAlertToday, maySendTestEmail, testEmailsLeft, utcDay, waitUntilNextUtcDay } from '../core/limits'
import type { AlertLogEntry, Verdict } from '../core/model'
import { signUnsubscribeToken, unsubscribeUrl } from '../core/unsubscribe-token'
import type { AlertStore, Clock, Mailer, MailMessage, ProjectRecord } from '../services/types'
import type { AlertHook } from './scan'

export interface AlertServices {
  store: AlertStore
  mailer: Mailer
  clock: Clock
  /** Where the app lives (src/core/app-origin.ts). Null when it is not known: then nothing is sent. */
  appOrigin: string | null
  /** The unsubscribe signing key, from the worker's env. Missing or empty: then nothing is sent. */
  signingKey: string | undefined
}

export type AlertOutcome =
  | { sent: true; verdictKeys: string[] }
  | { sent: false; why: 'project-gone' | 'alerts-off' | 'nothing-new' | 'already-alerted-today' }
  | { sent: false; why: 'send-failed' | 'error'; reason: string }

/**
 * The alert hook the scan engine calls after a successful full scan.
 * `report` is told what happened, for the worker's log.
 */
export function alertHookFor(services: AlertServices, report: (outcome: AlertOutcome) => void = () => {}): AlertHook {
  return async ({ projectId }) => {
    report(await runAlertStep(services, projectId))
  }
}

/**
 * Sends the project's alert email if there is news and the rules allow it.
 * Does not throw: the scan it follows has already succeeded, and a problem
 * with an email must not turn that into a failed scan.
 */
export async function runAlertStep(services: AlertServices, projectId: string): Promise<AlertOutcome> {
  try {
    return await alertProject(services, projectId)
  } catch (error) {
    return { sent: false, why: 'error', reason: messageOf(error) }
  }
}

async function alertProject(services: AlertServices, projectId: string): Promise<AlertOutcome> {
  const { store, clock } = services
  const project = await store.getProject(projectId)
  if (project === null) return { sent: false, why: 'project-gone' }
  if (!project.alertsEnabled) return { sent: false, why: 'alerts-off' }

  // If the log cannot be read this throws and nothing is sent: without it
  // there is no telling what was already sent.
  const log = await store.listAlerts(projectId)
  const items = pickAlertItems({
    dependencies: project.dependencies,
    verdicts: await loadVerdicts(store, project),
    reviewedKeys: project.reviewedKeys,
    alertedKeys: project.alertedKeys,
    log,
  })
  if (items.length === 0) return { sent: false, why: 'nothing-new' }

  if (!mayAlertToday({ alertsSentToday: alertsSentOn(log, utcDay(clock.now())) })) {
    return { sent: false, why: 'already-alerted-today' }
  }

  const delivery = await deliver(services, project, { kind: 'alert', items })
  if (!delivery.ok) return { sent: false, why: 'send-failed', reason: delivery.reason }

  // The second record of "alerted". Attempted even if the log write above
  // failed, and a failure here is not thrown: the email has gone, and
  // running this step again would send it again.
  const alertedKeys = [...new Set([...project.alertedKeys, ...delivery.verdictKeys])]
  await store.setAlertedKeys(project.id, alertedKeys).catch(() => {})
  return { sent: true, verdictKeys: delivery.verdictKeys }
}

// ------------------------------------------------------------ test emails

/**
 * A user's test emails for today (UTC). The server action backs it with
 * records (src/actions/alerts.ts); tests use a counter.
 */
export interface TestEmailCount {
  /** Test emails already counted today. */
  countToday(): Promise<number>
  /** Counts one more. Returns today's count, this one included. */
  record(): Promise<number>
}

export type TestEmailResult =
  /** `remaining` is how many more the user may send today. Null: no limit (the app owner). */
  | { ok: true; remaining: number | null }
  | { ok: false; refusal: 'project-gone' | 'test-limit' | 'send-failed'; message: string; remaining: number | null }

/**
 * "Send me a test": one test email for a project, to its owner's sign-in
 * address. The caller (the server action) has already checked that the
 * project is the caller's.
 *
 * The cap is checked, then this email is counted, then the cap is checked
 * again with it in: requests sent at the same moment each read the same
 * first count, and only the second look stops them. An email that then
 * fails to send still counts, because the attempt may have been paid for.
 */
export async function sendTestEmail(
  services: AlertServices,
  request: { projectId: string; isAppOwner: boolean; count: TestEmailCount },
): Promise<TestEmailResult> {
  const { store, clock } = services
  const { isAppOwner, count } = request

  const project = await store.getProject(request.projectId)
  const before = await count.countToday()
  if (project === null) {
    return { ok: false, refusal: 'project-gone', message: 'Project not found.', remaining: testEmailsLeft({ testEmailsToday: before, isAppOwner }) }
  }

  const tooMany: TestEmailResult = { ok: false, refusal: 'test-limit', message: testLimitMessage(clock.now()), remaining: 0 }
  if (!maySendTestEmail({ testEmailsToday: before, isAppOwner })) return tooMany
  const withThisOne = await count.record()
  if (!maySendTestEmail({ testEmailsToday: withThisOne - 1, isAppOwner })) return tooMany
  const remaining = testEmailsLeft({ testEmailsToday: withThisOne, isAppOwner })

  // The project's own breaking upgrades if it has any, so the test looks
  // like the real thing; otherwise a built-in example.
  const own = pickTestItems({
    dependencies: project.dependencies,
    verdicts: await loadVerdicts(store, project),
    reviewedKeys: project.reviewedKeys,
  })
  const delivery = await deliver(
    services,
    project,
    own.length > 0 ? { kind: 'test', items: own } : { kind: 'test', items: [SAMPLE_ALERT_ITEM], sample: true },
  )
  if (!delivery.ok) {
    return { ok: false, refusal: 'send-failed', message: `The test email could not be sent: ${delivery.reason}`, remaining }
  }
  return { ok: true, remaining }
}

/** Says when the limit resets: daily counters are keyed by UTC day. */
export function testLimitMessage(now: number): string {
  return `You have sent ${LIMITS.testEmailsPerUserPerDay} test emails today, which is the daily limit. You can send more after midnight UTC, in about ${waitUntilNextUtcDay(now)}.`
}

// ---------------------------------------------------------------- sending

type Delivery = { ok: true; verdictKeys: string[] } | { ok: false; reason: string }

/**
 * Composes one email for a project, sends it to the owner's sign-in
 * address, and writes the outcome to the send log. Used for alerts and
 * test emails alike, so they cannot differ in who they go to or what they
 * carry.
 */
async function deliver(
  services: AlertServices,
  project: ProjectRecord,
  content: { kind: 'alert' | 'test'; items: AlertItem[]; sample?: boolean },
): Promise<Delivery> {
  const { store, clock } = services
  const realKeys = content.sample ? [] : content.items.map((item) => item.verdictKey)

  const outcome = await send(services, project, content)

  const entry: AlertLogEntry = {
    projectId: project.id,
    userId: project.userId,
    sentAt: new Date(clock.now()).toISOString(),
    kind: content.kind,
    outcome: outcome.ok ? 'sent' : 'failed',
    // A line that names a verdict counts as one try at emailing it. When
    // the mailer was never reached (a setup problem) the line names none,
    // so the verdicts are not given up on and go out once it is fixed.
    verdictKeys: !outcome.ok && !outcome.tried ? [] : realKeys,
    failureReason: outcome.ok ? null : outcome.reason,
  }
  // Not thrown if it fails: whether the email went out is already decided,
  // and the caller must still get to say so (and, for an alert, to write
  // the project row's own record of it).
  await store.addAlert(entry).catch(() => {})

  return outcome.ok ? { ok: true, verdictKeys: realKeys } : { ok: false, reason: outcome.reason }
}

async function send(
  services: AlertServices,
  project: ProjectRecord,
  content: { kind: 'alert' | 'test'; items: AlertItem[]; sample?: boolean },
): Promise<{ ok: true } | { ok: false; reason: string; tried: boolean }> {
  // Everything an email needs before it may go out. Each missing piece is a
  // reason not to send, never a reason to send something lesser. `tried`
  // says whether the mailer was reached.
  const notSet = (reason: string) => ({ ok: false as const, reason, tried: false })
  if (!services.signingKey) return notSet('Unsubscribe links cannot be signed: the signing key is not set.')
  if (services.appOrigin === null) return notSet('The app does not know its own address.')
  const to = await services.store.getUserEmail(project.userId)
  if (to === null) return notSet('No sign-in address is on record for this account.')

  const token = await signUnsubscribeToken(project.id, services.signingKey)
  const email = composeAlertEmail({
    kind: content.kind,
    project: { id: project.id, repoOwner: project.repoOwner, repoName: project.repoName },
    items: content.items,
    sample: content.sample,
    appOrigin: services.appOrigin,
    unsubscribeUrl: unsubscribeUrl(services.appOrigin, token),
  })
  if (email === null) return notSet('There was nothing to send.')

  const message: MailMessage = {
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.headers,
    ...(ALERT_EMAIL.replyTo ? { replyTo: ALERT_EMAIL.replyTo } : {}),
  }
  try {
    const result = await services.mailer.send(message)
    return result.ok ? { ok: true } : { ok: false, reason: failureText(result.error), tried: true }
  } catch (error) {
    // A mailer should answer, not throw; if one does, it is a failed send.
    return { ok: false, reason: failureText(messageOf(error)), tried: true }
  }
}

// ---------------------------------------------------------------- helpers

/** The verdicts a project's dependencies point at, by key. */
async function loadVerdicts(store: AlertStore, project: ProjectRecord): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>()
  for (const dependency of project.dependencies) {
    const key = dependency.verdictKey
    if (key === undefined || verdicts.has(key)) continue
    const verdict = await store.getVerdict(key)
    if (verdict !== null) verdicts.set(key, verdict)
  }
  return verdicts
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A failure reason for the send log: one line, and not a page of provider output. */
function failureText(reason: string): string {
  const line = singleLine(reason)
  return line === '' ? 'The mail service did not say why.' : line.slice(0, 300)
}
