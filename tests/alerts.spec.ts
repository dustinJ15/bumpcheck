/**
 * Email alerts, the unsubscribe link, and delete (ticket 06), against fake
 * services.
 *
 * No email is sent. On the test server the mailer is a fake that writes
 * each message to a server-only collection (src/services/outbox-mailer.ts),
 * and the test-only `test-read-outbox` action hands a test the mail that
 * was addressed to its own account. That is how these tests read an email
 * and follow its unsubscribe link.
 *
 * What is being protected:
 *   - alerts are off until the owner turns them on, and the settings persist;
 *   - a daily scan sends one alert, to the owner's sign-in address, once;
 *   - a test email is sent and logged, three a day and no more;
 *   - the unsubscribe link works signed out, and only on the project it names;
 *   - only the owner can change alerts, send a test, or delete;
 *   - delete removes the project, its send log and its public report, and frees a slot.
 *
 * The unsubscribe links here are signed by the test server's own signing
 * key, which no test reads. A link is only ever followed, never printed:
 * the helpers below keep it out of failure messages.
 *
 * Accounts: Alice and Bob, ordinary members. The signed-out visitor is
 * Playwright's own `page`, which has no session.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { APIRequestContext, Page } from '@playwright/test'
import { LIMITS } from '../src/config'
import { FAKE_OWNER } from '../src/services/fake-world'
import { addProject, askRecordRoom, authToken, callAction, capturePath, openProjects, projectRow, resetProjects } from './helpers/app'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs the 2 test accounts (Alice and Bob), found ${usableTestAccounts}.`)

const DEMO = `${FAKE_OWNER}/demo`
const SECOND = `${FAKE_OWNER}/second`
const MAIL_DOWN = `${FAKE_OWNER}/mail-down`

// ---------------------------------------------------------------- helpers

interface OutboxMessage {
  to: string
  subject: string
  html: string
  text: string
  headers: Record<string, string>
}

/** The fake mail addressed to this page's user, oldest first. */
async function outbox(page: Page): Promise<OutboxMessage[]> {
  const answer = await callAction(page, 'test-read-outbox')
  expect(answer.success, answer.error).toBe(true)
  return (answer.data?.messages ?? []) as OutboxMessage[]
}

/** Adds a project and waits on its page until the first scan has finished. Returns its id. */
async function addScannedProject(page: Page, repo: string): Promise<string> {
  const projectId = await addProject(page, repo)
  await page.goto(`/projects/${projectId}`)
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  return projectId
}

async function openSettings(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/settings`)
  await expect(page.getByTestId('project-settings')).toBeVisible({ timeout: 15_000 })
}

async function setAlerts(page: Page, projectId: string, enabled: boolean) {
  const answer = await callAction(page, 'set-alerts', { projectId, enabled })
  expect(answer.success, answer.error).toBe(true)
}

/** Makes the project due and runs the scheduled task: the daily scan, without waiting a day. */
async function runDailyScan(page: Page, projectId: string) {
  const longAgo = new Date(Date.now() - 2 * LIMITS.rescanIntervalMs).toISOString()
  const due = await callAction(page, 'test-set-project-times', { projectId, nextDueAt: longAgo })
  expect(due.success, due.error).toBe(true)
  const ran = await callAction(page, 'test-run-scheduled-task')
  expect(ran.success, ran.error).toBe(true)
}

/** The unsubscribe link of an email, from its List-Unsubscribe header. */
function unsubscribeLinkOf(message: OutboxMessage): string {
  const link = /^<(.+)>$/.exec(message.headers['List-Unsubscribe'] ?? '')?.[1]
  // No value in the message: a link must not end up in a test report.
  if (!link) throw new Error('the email has no List-Unsubscribe link')
  return link
}

/** Opens a link without letting it into a failure message. */
async function openLink(page: Page, link: string) {
  const response = await page.goto(link).catch(() => null)
  if (response === null) throw new Error('the unsubscribe link could not be opened')
  return response.status()
}

/** POSTs to a link the way a mail client's own "unsubscribe" button does (RFC 8058), with no sign-in. */
async function oneClickPost(request: APIRequestContext, link: string): Promise<number> {
  const response = await request.post(link, { form: { 'List-Unsubscribe': 'One-Click' } }).catch(() => null)
  if (response === null) throw new Error('the one-click POST could not be sent')
  return response.status()
}

/**
 * Evidence for the ticket: a capture taken with `npx deepspace test
 * screenshot`, which cannot sign in and so shows what a signed-out visitor
 * gets. Only when BUMPCHECK_EVIDENCE is set, so a normal gate run does not
 * start a second browser. The command's output is not shown: it would
 * print the link.
 */
function cliScreenshot(url: string, name: string) {
  if (!process.env.BUMPCHECK_EVIDENCE) return
  mkdirSync(process.env.BUMPCHECK_EVIDENCE, { recursive: true })
  try {
    execFileSync(
      'npx',
      ['deepspace', 'test', 'screenshot', url, `${process.env.BUMPCHECK_EVIDENCE}/${name}`, '--full-page', '--viewport=900x700', '--wait-for-timeout=1500'],
      { stdio: 'ignore' },
    )
  } catch {
    throw new Error(`the screenshot command failed for ${name}`)
  }
}

/** A capture of the whole settings page. The app scrolls inside <main>, so the window is made tall enough first. */
async function captureSettings(page: Page, name: string) {
  const before = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.setViewportSize({ width: before.width, height: 1200 })
  await page.screenshot({ path: capturePath(name) })
  await page.setViewportSize(before)
}

const alertSwitch = (page: Page) => page.getByRole('switch', { name: 'Email alerts' })
const logRows = (page: Page) => page.getByTestId('send-log-row')

// ------------------------------------------------------------------ tests

test('alerts are off by default; the settings toggles persist across a reload', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addScannedProject(page, DEMO)
  await openSettings(page, projectId)

  // Off by default (story 38), and nothing has been sent.
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('alerts-state')).toHaveText('Off')
  await expect(page.getByTestId('send-log-empty')).toBeVisible()
  // The page says where alerts go: the address the user signs in with.
  await expect(page.getByTestId('alert-address')).toHaveText(alice.email)

  await alertSwitch(page).click()
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })
  await expect(page.getByTestId('alerts-state')).toHaveText('On')
  const publicSwitch = page.getByRole('switch', { name: 'Public report' })
  await publicSwitch.click()
  await expect(publicSwitch).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })

  await page.reload()
  await expect(page.getByTestId('project-settings')).toBeVisible({ timeout: 15_000 })
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('switch', { name: 'Public report' })).toHaveAttribute('aria-checked', 'true')

  // And off again, which also persists.
  await alertSwitch(page).click()
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })
  await page.reload()
  await expect(page.getByTestId('project-settings')).toBeVisible({ timeout: 15_000 })
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('switch', { name: 'Public report' })).toHaveAttribute('aria-checked', 'true')

  // Turning alerts on sent nothing by itself.
  expect(await outbox(page)).toEqual([])
})

test('a daily scan sends one alert to the owner, logs it, and does not send it again', async ({ users, baseURL }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addScannedProject(page, DEMO)

  // The first scan ran with alerts off: nothing was sent.
  expect(await outbox(page)).toEqual([])

  await setAlerts(page, projectId, true)
  await openSettings(page, projectId)
  await runDailyScan(page, projectId)

  // The log line arrives on the open page by itself.
  await expect(logRows(page)).toHaveCount(1, { timeout: 30_000 })
  await expect(logRows(page).first()).toHaveAttribute('data-kind', 'alert')
  await expect(logRows(page).first()).toHaveAttribute('data-outcome', 'sent')

  const mail = await outbox(page)
  expect(mail).toHaveLength(1)
  const message = mail[0]
  expect(message.to).toBe(alice.email)
  expect(message.subject).toBe(`bumpcheck: 2 new breaking upgrades in ${DEMO}`)
  // It stands on its own: package, version jump, summary, first "what to do" note.
  expect(message.text).toContain(`@${FAKE_OWNER}/router`)
  expect(message.text).toContain('4.18.0 → 5.1.0')
  expect(message.text).toContain('Two request and routing helpers were removed in 5.0.0 (fake judge).')
  expect(message.text).toContain('Call `app.delete()` instead.')
  // Its links point at this app, not at a hard-coded address.
  expect(message.html).toContain(`href="${baseURL}/projects/${projectId}"`)
  expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  const link = new URL(unsubscribeLinkOf(message))
  expect(link.origin).toBe(baseURL)
  expect(link.pathname).toBe('/api/unsubscribe')

  await captureSettings(page, 'settings-alerts-on-with-log.png')

  // The next day's scan finds the same verdicts: no second email.
  await page.goto(`/projects/${projectId}`)
  const projectPage = page.getByTestId('project-page')
  await expect(projectPage).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  const firstScanAt = await projectPage.getAttribute('data-last-scan-at')
  await runDailyScan(page, projectId)
  await expect(projectPage).not.toHaveAttribute('data-last-scan-at', String(firstScanAt), { timeout: 30_000 })
  await expect(projectPage).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  // The alert step runs just after the results are written; give it a moment before looking.
  await page.waitForTimeout(1500)
  expect(await outbox(page)).toHaveLength(1)
  await openSettings(page, projectId)
  await expect(logRows(page)).toHaveCount(1)
})

test('a test send appears in the log, and the fourth test send in a day is refused', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addScannedProject(page, DEMO)
  await openSettings(page, projectId)

  const left = page.getByTestId('test-emails-left')
  await expect(left).toHaveText(`${LIMITS.testEmailsPerUserPerDay} of ${LIMITS.testEmailsPerUserPerDay} test emails left today.`, { timeout: 10_000 })

  // Alerts are off: a test email is sent anyway, because the user asked for it.
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false')
  const sendTest = page.getByRole('button', { name: 'Send me a test' })
  await sendTest.click()
  await expect(page.getByTestId('test-email-result')).toHaveText(`Test email sent to ${alice.email}.`, { timeout: 15_000 })
  await expect(left).toHaveText('2 of 3 test emails left today.')
  await expect(logRows(page)).toHaveCount(1, { timeout: 10_000 })
  await expect(logRows(page).first()).toHaveAttribute('data-kind', 'test')
  await expect(logRows(page).first()).toHaveAttribute('data-outcome', 'sent')

  const first = (await outbox(page))[0]
  expect(first.to).toBe(alice.email)
  expect(first.subject).toBe(`[Test] bumpcheck: 2 new breaking upgrades in ${DEMO}`)
  expect(first.text).toContain('This is a test email')

  for (const expected of ['1 of 3 test emails left today.', '0 of 3 test emails left today.']) {
    await sendTest.click()
    await expect(left).toHaveText(expected, { timeout: 15_000 })
  }
  await expect(logRows(page)).toHaveCount(3, { timeout: 10_000 })

  // The fourth: refused by the server, with the reason on the page. Nothing is sent or logged.
  await sendTest.click()
  const refusal = page.getByTestId('test-email-result')
  await expect(refusal).toHaveAttribute('data-ok', 'false', { timeout: 15_000 })
  await expect(refusal).toContainText('You have sent 3 test emails today, which is the daily limit.')
  expect(await outbox(page)).toHaveLength(3)
  await expect(logRows(page)).toHaveCount(3)

  // Straight to the server, past the page: the same answer.
  const direct = await callAction(page, 'send-test-email', { projectId })
  expect(direct).toMatchObject({ success: false, code: 'test-limit' })
  expect(await outbox(page)).toHaveLength(3)

  // The count is the server's: a reload shows it, and a test email did not turn alerts on.
  await page.reload()
  await expect(page.getByTestId('test-emails-left')).toHaveText('0 of 3 test emails left today.', { timeout: 15_000 })
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false')

  // Deleting the project and adding it again does not give the allowance back.
  expect((await callAction(page, 'delete-project', { projectId })).success).toBe(true)
  const again = await addProject(page, DEMO)
  expect(await callAction(page, 'send-test-email', { projectId: again })).toMatchObject({ success: false, code: 'test-limit' })
  expect(await outbox(page)).toHaveLength(3)
})

test('a test email that cannot be sent is shown as failed, with the reason', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  // The fake mailer refuses mail for this repo (src/services/outbox-mailer.ts).
  const projectId = await addScannedProject(page, MAIL_DOWN)
  await openSettings(page, projectId)

  await page.getByRole('button', { name: 'Send me a test' }).click()
  const result = page.getByTestId('test-email-result')
  await expect(result).toHaveAttribute('data-ok', 'false', { timeout: 15_000 })
  await expect(result).toContainText('The test email could not be sent: The mail service answered 503 (fake).')

  await expect(logRows(page)).toHaveCount(1, { timeout: 10_000 })
  await expect(logRows(page).first()).toHaveAttribute('data-outcome', 'failed')
  await expect(logRows(page).first()).toContainText('The mail service answered 503 (fake).')
  // The attempt still counts.
  await expect(page.getByTestId('test-emails-left')).toHaveText('2 of 3 test emails left today.')
  expect(await outbox(page)).toEqual([])
  await captureSettings(page, 'settings-send-failed.png')
})

test('the unsubscribe link turns alerts off while signed out: the page asks once, and one click does it', async ({ users, page: visitor }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addScannedProject(page, DEMO)
  await setAlerts(page, projectId, true)
  expect((await callAction(page, 'send-test-email', { projectId })).success).toBe(true)
  const link = unsubscribeLinkOf((await outbox(page))[0])

  // Alice has her settings open in her own browser. She switched alerts off
  // and on again there, so the page has seen her own request; from here on
  // she does nothing.
  await openSettings(page, projectId)
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'true')
  await alertSwitch(page).click()
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })
  await alertSwitch(page).click()
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })

  // The visitor has no session. Opening the link shows a page and changes nothing.
  expect(await openLink(visitor, link)).toBe(200)
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(`Stop alert emails for ${DEMO}?`)
  await expect(visitor.getByRole('button')).toHaveCount(1)
  cliScreenshot(link, 'unsubscribe-confirm.png')
  // Opened twice by now (once by the screenshot command when taking evidence): still on.
  await visitor.waitForTimeout(1000)
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'true')

  // The one click.
  await visitor.getByRole('button', { name: 'Stop these emails' }).click()
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(`Alert emails for ${DEMO} are off.`)
  await visitor.screenshot({ path: capturePath('unsubscribe-done.png'), fullPage: true })

  // Alice's open page follows without a reload, and a reload agrees.
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })
  await page.reload()
  await expect(page.getByTestId('project-settings')).toBeVisible({ timeout: 15_000 })
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false')

  // She can turn alerts back on from the page she already had open, and off again.
  await alertSwitch(page).click()
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })
  await alertSwitch(page).click()
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })

  // Opening the link again says so and offers nothing to press.
  expect(await openLink(visitor, link)).toBe(200)
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(`Alert emails for ${DEMO} are already off.`)
  await expect(visitor.getByRole('button')).toHaveCount(0)
  cliScreenshot(link, 'unsubscribe-already-off.png')
})

test('a mail client\'s one-click POST unsubscribes without a sign-in, and only the project the link names', async ({ users, playwright, baseURL }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const demo = await addScannedProject(page, DEMO)
  const second = await addScannedProject(page, SECOND)
  await setAlerts(page, demo, true)
  await setAlerts(page, second, true)
  expect((await callAction(page, 'send-test-email', { projectId: demo })).success).toBe(true)
  const link = unsubscribeLinkOf((await outbox(page))[0])

  // A client with no cookies and no token, as a mail provider's server is.
  const mailClient = await playwright.request.newContext({ baseURL })

  // A tampered link, a made-up one and a bare one are refused, and change nothing.
  const tampered = link.slice(0, -1) + (link.endsWith('A') ? 'B' : 'A')
  expect(await oneClickPost(mailClient, tampered)).toBe(400)
  expect(await oneClickPost(mailClient, '/api/unsubscribe?token=bm90LXJlYWw.bm90LXJlYWw')).toBe(400)
  expect(await oneClickPost(mailClient, '/api/unsubscribe')).toBe(400)
  await openSettings(page, demo)
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'true')

  // The genuine link.
  expect(await oneClickPost(mailClient, link)).toBe(200)
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })

  // The other project was not touched.
  await openSettings(page, second)
  await expect(alertSwitch(page)).toHaveAttribute('aria-checked', 'true')

  // The route does nothing else: any other method is not found.
  const other = await mailClient.delete(link).catch(() => null)
  expect(other?.status()).toBe(404)
  await mailClient.dispose()
})

test('a bad unsubscribe link gets a plain error page', async ({ page: visitor }) => {
  const response = await visitor.goto('/api/unsubscribe?token=bm90LXJlYWw.bm90LXJlYWw')
  expect(response?.status()).toBe(400)
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('This unsubscribe link is not valid.')
  await expect(visitor.getByRole('button')).toHaveCount(0)
  // The page keeps itself out of caches and search results, and loads nothing.
  expect(response?.headers()['cache-control']).toBe('no-store')
  expect(response?.headers()['referrer-policy']).toBe('no-referrer')
  expect(response?.headers()['content-security-policy']).toContain("default-src 'none'")
  await visitor.screenshot({ path: capturePath('unsubscribe-invalid.png'), fullPage: true })
})

test('only the owner can change alerts, send a test, or delete a project', async ({ users, request }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  await resetProjects(alice.page)
  await resetProjects(bob.page)
  const projectId = await addScannedProject(alice.page, DEMO)

  const notFound = { success: false, code: 'project-not-found' }
  expect(await callAction(bob.page, 'set-alerts', { projectId, enabled: true })).toMatchObject(notFound)
  expect(await callAction(bob.page, 'send-test-email', { projectId })).toMatchObject(notFound)
  expect(await callAction(bob.page, 'delete-project', { projectId })).toMatchObject(notFound)

  // Nothing happened: alerts still off, no mail for anyone, the project still there.
  await openSettings(alice.page, projectId)
  await expect(alertSwitch(alice.page)).toHaveAttribute('aria-checked', 'false')
  await expect(alice.page.getByTestId('send-log-empty')).toBeVisible()
  expect(await outbox(alice.page)).toEqual([])
  expect(await outbox(bob.page)).toEqual([])
  // Bob's attempt used none of his allowance either.
  expect((await callAction(bob.page, 'test-email-allowance')).data).toMatchObject({ remaining: LIMITS.testEmailsPerUserPerDay })

  // An action takes no address: a "to" in the request is ignored, and the mail goes to the caller's own.
  const sent = await callAction(alice.page, 'send-test-email', { projectId, to: bob.email, email: bob.email, userId: 'someone-else' })
  expect(sent.success, sent.error).toBe(true)
  expect((await outbox(alice.page)).map((message) => message.to)).toEqual([alice.email])
  expect(await outbox(bob.page)).toEqual([])

  // Bob cannot read Alice's send log from the record room.
  await openProjects(bob.page)
  const bobSees = await askRecordRoom(bob.page, await authToken(bob.page), 'alerts')
  expect(bobSees.records).toEqual([])

  // Signed out, none of the actions answers at all.
  for (const name of ['set-alerts', 'send-test-email', 'test-email-allowance', 'delete-project', 'test-read-outbox']) {
    const response = await request.post(`/api/actions/${name}`, { data: { projectId, enabled: true } })
    expect(response.status(), name).toBe(401)
  }
})

test('delete removes the project, its send log and its public report, and frees a slot', async ({ users, page: visitor }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addScannedProject(page, DEMO)
  await addProject(page, SECOND)
  await addProject(page, `${FAKE_OWNER}/third`)

  // At the limit: a fourth is refused.
  expect(await callAction(page, 'add-project', { repo: `${FAKE_OWNER}/fourth` })).toMatchObject({ success: false, code: 'project-limit' })

  // The project is public and has a line in its send log.
  expect((await callAction(page, 'set-visibility', { projectId, visibility: 'public' })).success).toBe(true)
  await visitor.goto(`/share/${projectId}`)
  await expect(visitor.getByTestId('public-report')).toBeVisible({ timeout: 15_000 })
  expect((await callAction(page, 'send-test-email', { projectId })).success).toBe(true)
  const token = await authToken(page)
  expect((await askRecordRoom(page, token, 'alerts')).records.filter((record) => record.data.projectId === projectId)).toHaveLength(1)

  // Delete, on the settings page, with the confirmation.
  await openSettings(page, projectId)
  await page.getByRole('button', { name: 'Delete project' }).click()
  const dialog = page.getByRole('dialog', { name: `Delete ${DEMO}?` })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: capturePath('settings-delete-confirm.png'), fullPage: true })
  // Cancelling deletes nothing.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('project-settings')).toBeVisible()

  await page.getByRole('button', { name: 'Delete project' }).click()
  await page.getByRole('dialog', { name: `Delete ${DEMO}?` }).getByRole('button', { name: 'Delete project' }).click()

  // Back on the list, without the project.
  await expect(page).toHaveURL(/\/projects$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible({ timeout: 15_000 })
  await expect(projectRow(page, SECOND)).toBeVisible({ timeout: 15_000 })
  await expect(projectRow(page, DEMO)).toHaveCount(0)

  // Its public report is gone: the open page says so, and so does a fresh visit.
  await expect(visitor.getByTestId('public-report-not-available')).toBeVisible({ timeout: 15_000 })
  await visitor.goto(`/share/${projectId}`)
  await expect(visitor.getByTestId('public-report-not-available')).toBeVisible({ timeout: 15_000 })
  expect((await askRecordRoom(visitor, null, 'publicReports')).records.filter((record) => record.recordId === projectId)).toEqual([])

  // Its send log is gone, and the shared verdicts are not.
  expect((await askRecordRoom(page, token, 'alerts')).records.filter((record) => record.data.projectId === projectId)).toEqual([])
  const verdicts = (await askRecordRoom(page, token, 'verdicts')).records
  expect(verdicts.some((record) => record.data.packageName === `@${FAKE_OWNER}/router`)).toBe(true)

  // Its settings page is not available any more.
  await page.goto(`/projects/${projectId}/settings`)
  await expect(page.getByTestId('project-not-available')).toBeVisible({ timeout: 15_000 })

  // The slot is free: the fourth repo can be added now.
  expect((await callAction(page, 'add-project', { repo: `${FAKE_OWNER}/fourth` })).success).toBe(true)
  await openProjects(page)
  await expect(projectRow(page, `${FAKE_OWNER}/fourth`)).toBeVisible({ timeout: 15_000 })
})
