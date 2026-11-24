/**
 * Signed-in flows for scheduling and limits (ticket 04), against fake services.
 *
 * Covers: the scheduled task re-scanning a due project (triggered directly,
 * never waited for), idle projects, "scan now" and its cooldown, the four
 * notices on the project page, the add-attempt cap, and the lock on the
 * cron room.
 *
 * Time cannot be waited for in a test, so three test-only actions stand in
 * for it (src/actions/test-reset.ts): `test-set-project-times` moves a
 * project's own time columns, `test-use-up-daily-ai-limit` sets today's
 * AI-call count to the ceiling, and `test-run-scheduled-task` sends the cron
 * room the platform's own trigger as the app owner.
 *
 * Accounts: Alice and Bob, ordinary members, not the app owner.
 */

import { readFileSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'
import { LIMITS, SCHEDULE } from '../src/config'
import { FAKE_OWNER } from '../src/services/fake-world'
import { addProject, authToken, callAction, capturePath, openProjects, projectRow, resetProjects } from './helpers/app'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs the 2 test accounts (Alice and Bob), found ${usableTestAccounts}.`)

const DEMO = `${FAKE_OWNER}/demo`
const fake = (name: string) => `@${FAKE_OWNER}/${name}`
const APP_ID = /DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/.exec(readFileSync('wrangler.toml', 'utf8'))?.[1]
const CRON_ROOM = `app:${APP_ID}`

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

// ---------------------------------------------------------------- helpers

function projectPage(page: Page) {
  return page.getByTestId('project-page')
}

/** Opens a project's page and waits until its scan has ended in `status`. */
async function openProject(page: Page, projectId: string, status: 'done' | 'failed' = 'done') {
  await page.goto(`/projects/${projectId}`)
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', status, { timeout: 30_000 })
}

/** When the project's last successful full scan finished, as the page has it. Changes only when a full scan ends. */
async function lastScanAt(page: Page): Promise<string> {
  const value = await projectPage(page).getAttribute('data-last-scan-at')
  expect(value, 'the project has been scanned').toBeTruthy()
  return String(value)
}

/** Runs the scheduled task now, through the cron room, and waits for it to end. */
async function runScheduledTask(page: Page) {
  const ran = await callAction(page, 'test-run-scheduled-task')
  expect(ran.success, ran.error).toBe(true)
}

async function setTimes(page: Page, projectId: string, times: Record<string, string>) {
  const set = await callAction(page, 'test-set-project-times', { projectId, ...times })
  expect(set.success, set.error).toBe(true)
}

/** A capture of the whole page. The app scrolls inside <main>, so the window is made tall enough first. */
async function captureWhole(page: Page, name: string) {
  const before = page.viewportSize() ?? { width: 1280, height: 720 }
  const needed = await page.evaluate(() => {
    const main = document.querySelector('main')
    return main ? main.scrollHeight + (window.innerHeight - main.clientHeight) : document.body.scrollHeight
  })
  await page.setViewportSize({ width: before.width, height: Math.max(needed, 400) })
  await page.screenshot({ path: capturePath(name) })
  await page.setViewportSize(before)
}

/**
 * Opens the cron room's WebSocket from the page, sends each message, and
 * returns everything the room said.
 */
async function talkToCronRoom(page: Page, token: string | null, messages: unknown[]): Promise<string[]> {
  return page.evaluate(
    async ({ room, token, messages }) => {
      const url = new URL(`/ws/cron/${encodeURIComponent(room)}`, window.location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      if (token) url.searchParams.set('token', token)
      const received: string[] = []
      const socket = new WebSocket(url)
      socket.onmessage = (event) => received.push(String(event.data))
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve()
        socket.onerror = () => reject(new Error('cron room socket failed to open'))
      })
      // Let the room send its greeting, then try each write.
      await new Promise((resolve) => setTimeout(resolve, 1000))
      for (const message of messages) socket.send(JSON.stringify(message))
      await new Promise((resolve) => setTimeout(resolve, 2500))
      socket.close()
      return received
    },
    { room: CRON_ROOM, token, messages },
  )
}

type RoomMessage = { type: string; payload?: Record<string, unknown> }

const CRON_WRITES = [
  { type: 'cron.trigger', payload: { taskName: SCHEDULE.taskName, requestId: 'test-trigger' } },
  { type: 'cron.pause', payload: { taskName: SCHEDULE.taskName, requestId: 'test-pause' } },
  { type: 'cron.resume', payload: { taskName: SCHEDULE.taskName, requestId: 'test-resume' } },
]

/** What the room must have answered to someone who may not write: three refusals, and the task untouched. */
function expectEveryWriteRefused(received: string[]) {
  const messages = received.map((text) => JSON.parse(text) as RoomMessage)
  expect(messages[0]).toEqual({ type: 'auth', payload: { canWrite: false } })

  const receipts = messages.filter((m) => m.type === 'cron.ack')
  expect(receipts.map((m) => m.payload?.requestId)).toEqual(['test-trigger', 'test-pause', 'test-resume'])
  for (const receipt of receipts) expect(receipt.payload).toMatchObject({ ok: false, reason: 'read_only' })

  // The task is still there, hourly, and was not paused.
  const tasks = messages.filter((m) => m.type === 'cron.tasks').at(-1)?.payload?.tasks as Array<Record<string, unknown>>
  expect(tasks).toHaveLength(1)
  expect(tasks[0]).toMatchObject({ name: SCHEDULE.taskName, intervalMinutes: 60, paused: false })
}

// ------------------------------------------------------------------ tests

test('the scheduled task, triggered directly, re-scans a due project and leaves one that is not due', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addProject(page, DEMO)
  await openProject(page, projectId)
  const firstScanAt = await lastScanAt(page)

  // Scanned a moment ago, so it is not due: a run of the task does nothing to it.
  await runScheduledTask(page)
  await page.waitForTimeout(2000)
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'done')
  expect(await lastScanAt(page)).toBe(firstScanAt)

  // A day passes (its due time is moved into the past). The next run scans it,
  // and the page follows along without a reload.
  await setTimes(page, projectId, { nextDueAt: ago(MINUTE) })
  await runScheduledTask(page)
  await expect(projectPage(page)).not.toHaveAttribute('data-last-scan-at', firstScanAt, { timeout: 30_000 })
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  const secondScanAt = await lastScanAt(page)
  expect(Date.parse(secondScanAt)).toBeGreaterThan(Date.parse(firstScanAt))
  // The report is the same report: cached verdicts were attached, not read again.
  await expect(page.locator(`[data-testid="dependency-row"][data-package="${fake('router')}"]`)).toHaveAttribute('data-state', 'breaking')

  // That scan made it "not due" again: one more run leaves it alone.
  await runScheduledTask(page)
  await page.waitForTimeout(2000)
  expect(await lastScanAt(page)).toBe(secondScanAt)
})

test('an idle project is not scanned until its owner opens it again', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addProject(page, DEMO)

  // Watched from the projects list, which does not count as opening the project.
  await openProjects(page)
  const row = projectRow(page, DEMO)
  await expect(row).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  const firstScanAt = await row.getAttribute('data-last-scan-at')
  expect(firstScanAt).toBeTruthy()

  // Due, but not opened for over 7 days: the task passes it by.
  await setTimes(page, projectId, { nextDueAt: ago(MINUTE), lastOpenedAt: ago(LIMITS.idlePauseMs + MINUTE) })
  await runScheduledTask(page)
  await page.waitForTimeout(2500)
  await expect(row).toHaveAttribute('data-scan-status', 'done')
  await expect(row).toHaveAttribute('data-last-scan-at', firstScanAt ?? '')

  // Idle and not due for hours yet: opening the project makes it due now,
  // so the next run scans it with no other click.
  await setTimes(page, projectId, { nextDueAt: new Date(Date.now() + DAY / 2).toISOString() })
  const opened = page.waitForResponse((response) => response.url().endsWith('/api/actions/record-opened'))
  await page.goto(`/projects/${projectId}`)
  await opened
  await runScheduledTask(page)
  await expect(projectPage(page)).not.toHaveAttribute('data-last-scan-at', firstScanAt ?? '', { timeout: 30_000 })
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
})

test('scan now inside the cooldown shows a notice with the time it returns; after the cooldown it scans', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addProject(page, DEMO)
  await openProject(page, projectId)
  const firstScanAt = await lastScanAt(page)
  await expect(page.getByTestId('notice-cooldown')).toHaveCount(0)

  // Adding the project was a scan request, a few seconds ago.
  await page.getByRole('button', { name: 'Scan now' }).click()
  const notice = page.getByTestId('notice-cooldown')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Scan now is cooling down')
  // It says when, as a clock time.
  await expect(notice).toContainText(/available again at \d{1,2}:\d{2}/)
  await captureWhole(page, 'project-notice-cooldown.png')
  // Nothing was started.
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'done')
  expect(await lastScanAt(page)).toBe(firstScanAt)

  // The server is what refuses, whatever the page does, and it says when too.
  const refused = await callAction(page, 'scan-now', { projectId })
  expect(refused).toMatchObject({ success: false, code: 'cooling-down' })
  expect(refused.error).toMatch(/^Scan now is cooling down\. It will be available again at \d\d:\d\d UTC\.$/)
  const availableAt = Number((refused as { details?: { availableAt?: number } }).details?.availableAt)
  expect(availableAt).toBeGreaterThan(Date.now())
  expect(availableAt).toBeLessThanOrEqual(Date.now() + LIMITS.scanNowCooldownMs)

  // Just short of ten minutes later it is still refused; at ten minutes it scans.
  await setTimes(page, projectId, { lastScanRequestedAt: ago(LIMITS.scanNowCooldownMs - 30_000) })
  expect(await callAction(page, 'scan-now', { projectId })).toMatchObject({ success: false, code: 'cooling-down' })
  await setTimes(page, projectId, { lastScanRequestedAt: ago(LIMITS.scanNowCooldownMs + 1000) })
  await page.getByRole('button', { name: 'Scan now' }).click()
  await expect(projectPage(page)).not.toHaveAttribute('data-last-scan-at', firstScanAt, { timeout: 30_000 })
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('notice-cooldown')).toHaveCount(0)

  // And that scan started a new cooldown.
  expect(await callAction(page, 'scan-now', { projectId })).toMatchObject({ success: false, code: 'cooling-down' })
})

test('scan now is refused while a scan is running: one scan at a time', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  const page = alice.page
  await resetProjects(page)
  // The slow repo's scan takes several seconds.
  const projectId = await addProject(page, `${FAKE_OWNER}/slow`)
  await setTimes(page, projectId, { lastScanRequestedAt: ago(LIMITS.scanNowCooldownMs + 1000) })

  // The first scan is still queued or running, and the cooldown is over.
  expect(await callAction(page, 'scan-now', { projectId })).toMatchObject({
    success: false,
    code: 'scan-running',
    error: 'A scan is already running for this project. Try again when it finishes.',
  })

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('button', { name: 'Scan now' })).toBeDisabled()
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Scan now' })).toBeEnabled()

  // Someone else's project cannot be scanned at all.
  expect(await callAction(bob.page, 'scan-now', { projectId })).toMatchObject({ success: false, code: 'project-not-found' })
})

test('a scan that stops at its limit says so, and a later scan reads the rest', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addProject(page, `${FAKE_OWNER}/many`)
  await openProject(page, projectId)

  const rows = page.getByTestId('dependency-row')
  await expect(rows).toHaveCount(LIMITS.newVerdictsPerScan + 2)
  await expect(page.locator('[data-testid="dependency-row"][data-state="breaking"]')).toHaveCount(LIMITS.newVerdictsPerScan, {
    timeout: 15_000,
  })
  await expect(page.locator('[data-testid="dependency-row"][data-state="pending"]')).toHaveCount(2)

  const notice = page.getByTestId('notice-scan-cap')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText(`limit of ${LIMITS.newVerdictsPerScan} new verdicts`)
  await expect(notice).toContainText('2 upgrades')
  await expect(notice).toContainText('later scans')
  await expect(page.getByTestId('notice-daily-ceiling')).toHaveCount(0)
  // The top of the page as a reader sees it, and the whole (long) page.
  await page.screenshot({ path: capturePath('project-notice-scan-cap.png') })
  await captureWhole(page, 'project-notice-scan-cap-whole-page.png')

  // The next daily scan reads the two that were left, and the notice goes.
  await setTimes(page, projectId, { nextDueAt: ago(MINUTE) })
  await runScheduledTask(page)
  await expect(page.locator('[data-testid="dependency-row"][data-state="breaking"]')).toHaveCount(LIMITS.newVerdictsPerScan + 2, {
    timeout: 30_000,
  })
  await expect(notice).toHaveCount(0)
})

test("the app's daily AI limit stops the judge on every path, and the page says it is a limit", async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const used = await callAction(page, 'test-use-up-daily-ai-limit')
  expect(used.success, used.error).toBe(true)

  // First scan: triaged, but nothing is read.
  const projectId = await addProject(page, DEMO)
  await openProject(page, projectId)
  const row = (name: string) => page.locator(`[data-testid="dependency-row"][data-package="${fake(name)}"]`)
  await expect(page.getByTestId('dependency-row')).toHaveCount(10)
  await expect(row('router')).toHaveAttribute('data-state', 'pending')
  await expect(row('router')).toContainText("the app's daily AI limit was reached")

  const notice = page.getByTestId('notice-daily-ceiling')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText("The app's daily AI limit has been reached")
  await expect(notice).toContainText('6 upgrades')
  await expect(notice).toContainText('not a fault')
  await expect(page.getByTestId('notice-scan-cap')).toHaveCount(0)
  await captureWhole(page, 'project-notice-daily-limit.png')

  // Scan now, and the scheduled scan: still nothing read.
  const firstScanAt = await lastScanAt(page)
  await setTimes(page, projectId, { lastScanRequestedAt: ago(LIMITS.scanNowCooldownMs + 1000) })
  expect((await callAction(page, 'scan-now', { projectId })).success).toBe(true)
  await expect(projectPage(page)).not.toHaveAttribute('data-last-scan-at', firstScanAt, { timeout: 30_000 })
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(row('router')).toHaveAttribute('data-state', 'pending')

  const secondScanAt = await lastScanAt(page)
  await setTimes(page, projectId, { nextDueAt: ago(MINUTE) })
  await runScheduledTask(page)
  await expect(projectPage(page)).not.toHaveAttribute('data-last-scan-at', secondScanAt, { timeout: 30_000 })
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(row('router')).toHaveAttribute('data-state', 'pending')

  // Check one: accepted, runs, reads nothing, and says why on the dependency.
  expect((await callAction(page, 'check-dependency', { projectId, packageName: fake('colors') })).success).toBe(true)
  await expect(row('colors')).toContainText("the app's daily AI limit was reached", { timeout: 30_000 })
  await expect(row('colors')).toHaveAttribute('data-state', 'not-read')
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(notice).toContainText('7 upgrades')
})

test('a failed scan shows its reason and a retry, and the retry is under the cooldown', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  // Its one major needs a changelog the fake GitHub cannot serve: the scan is retried once, then fails.
  const projectId = await addProject(page, `${FAKE_OWNER}/outage`)
  await openProject(page, projectId, 'failed')

  const notice = page.getByTestId('notice-scan-failed')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('The last scan failed')
  await expect(notice).toContainText('The scan could not finish. Try again later.')
  await expect(notice).toContainText('next daily scan')
  // The first scan was requested moments ago, so the notice says when Retry will work.
  await expect(notice).toContainText(/Retry will be available at \d{1,2}:\d{2}/)
  const retry = notice.getByRole('button', { name: 'Retry scan' })
  await expect(retry).toBeVisible()
  await captureWhole(page, 'project-notice-scan-failed.png')

  // Retry is "scan now": inside the cooldown it is refused like any other.
  await retry.click()
  await expect(page.getByTestId('notice-cooldown')).toBeVisible()
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'failed')

  // After the cooldown it starts a scan (which fails again here, for the same reason).
  await setTimes(page, projectId, { lastScanRequestedAt: ago(LIMITS.scanNowCooldownMs + 1000) })
  await retry.click()
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', /queued|scanning/, { timeout: 10_000 })
  await expect(notice).toHaveCount(0)
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'failed', { timeout: 30_000 })
  await expect(notice).toContainText('The scan could not finish. Try again later.')

  // The failed attempt counts as the day's scan: the scheduled task does not pick it up again.
  await runScheduledTask(page)
  await page.waitForTimeout(2000)
  await expect(projectPage(page)).toHaveAttribute('data-scan-status', 'failed')
})

test('an upgrade whose release notes GitHub refused is shown as not read this time, with no verdict', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)
  const projectId = await addProject(page, `${FAKE_OWNER}/ratelimited`)
  await openProject(page, projectId)

  const limited = page.locator(`[data-testid="dependency-row"][data-package="${fake('limited')}"]`)
  await expect(limited).toHaveAttribute('data-state', 'pending')
  await expect(limited).toContainText('GitHub did not answer')
  await expect(limited).toContainText('The next scan will try again')
  // Not "no changelog found": that would be a stored verdict, shared with everyone.
  await expect(limited).not.toContainText('No changelog found')
  await expect(page.getByTestId('notice-source-refused')).toContainText('1 upgrade')
})

test('add-project attempts are capped per user per day, and the refusal says when the cap resets', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  const page = alice.page
  await resetProjects(page)
  await resetProjects(bob.page)
  const cap = LIMITS.addAttemptsPerUserPerDay

  // Requests refused for free are not attempts, however many there are.
  for (let i = 0; i < 3; i++) {
    expect(await callAction(page, 'add-project', { repo: 'not a repo' })).toMatchObject({ success: false, code: 'invalid-input' })
  }

  // Twenty attempts that reach GitHub, each refused there.
  for (let i = 1; i <= cap; i++) {
    const answer = await callAction(page, 'add-project', { repo: `${FAKE_OWNER}/no-such-repo-${i}` })
    expect(answer, `attempt ${i}`).toMatchObject({ success: false, code: 'repo-not-found' })
  }

  // The twenty-first is refused before GitHub is asked, even for a repo that exists.
  await openProjects(page)
  await page.getByLabel('Add a project').fill(DEMO)
  await page.getByRole('button', { name: 'Add project' }).click()
  const error = page.getByTestId('add-project-error')
  await expect(error).toContainText(`You have tried to add a project ${cap} times today, which is the daily limit.`)
  await expect(error).toContainText(/You can try again after midnight UTC, in about \d+ (hours|minutes?)\./)
  await expect(page.getByTestId('project-row')).toHaveCount(0)
  expect(await callAction(page, 'add-project', { repo: DEMO })).toMatchObject({ success: false, code: 'attempt-limit' })

  // The cap is per user: Bob is not affected by Alice's attempts.
  expect((await callAction(bob.page, 'add-project', { repo: DEMO })).success).toBe(true)
})

test.describe('the cron room is locked down', () => {
  test('a member cannot trigger, pause or resume the scheduled task', async ({ users }) => {
    const [alice] = await users(['Alice'])
    await alice.page.goto('/projects')
    const received = await talkToCronRoom(alice.page, await authToken(alice.page), [...CRON_WRITES, { type: 'cron.tasks', payload: {} }])
    expectEveryWriteRefused(received)
  })

  test('a signed-out visitor cannot either', async ({ page }) => {
    await page.goto('/projects')
    const received = await talkToCronRoom(page, null, [...CRON_WRITES, { type: 'cron.tasks', payload: {} }])
    expectEveryWriteRefused(received)
  })

  test('the test-only trigger is not an open door: it needs a sign-in', async ({ request }) => {
    const noToken = await request.post('/api/actions/test-run-scheduled-task', { data: {} })
    expect(noToken.status()).toBe(401)
  })
})

test('nothing is left behind for the next run of the scheduled task', async ({ users }) => {
  // The local record room keeps its rows between runs. A project left here
  // would be due tomorrow, and the task (which also runs once when the test
  // server starts) would scan it while tomorrow's first test is starting.
  const [alice, bob] = await users(['Alice', 'Bob'])
  await resetProjects(alice.page)
  await resetProjects(bob.page)
  await openProjects(alice.page)
  await expect(alice.page.getByTestId('projects-empty')).toBeVisible({ timeout: 15_000 })
})
