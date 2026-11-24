/**
 * Public sharing and the landing page (ticket 05), against fake services.
 *
 * What is being protected:
 *   - a project is private until its owner switches it to public;
 *   - a public report can be read by anyone with the link, and changed by nobody;
 *   - what a reader of a public report receives names no one: the tests look
 *     at the data that arrived over the wire, not only at the page;
 *   - switching back to private takes the report away again;
 *   - only the owner can switch.
 *
 * How it is built (src/server/public-report.ts): a project row carries its
 * owner's id and the platform sends whole rows, so project rows are readable
 * by their owner only. A public project has a second row, in `publicReports`,
 * holding just what the public page shows. The public page reads only that.
 *
 * Accounts: Alice and Bob, ordinary members. The signed-out visitor is
 * Playwright's own `page`, which has no session.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Locator, Page } from '@playwright/test'
import { EXAMPLE_PROJECT_ID } from '../src/config'
import { PUBLIC_REPORT_COLUMNS } from '../src/core/public-report'
import { FAKE_OWNER } from '../src/services/fake-world'
import { addProject, askRecordRoom, askUserList, authToken, callAction, capturePath, RECORD_ROOM, resetProjects, type WireRecord } from './helpers/app'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs the 2 test accounts (Alice and Bob), found ${usableTestAccounts}.`)

const DEMO = `${FAKE_OWNER}/demo`
const fake = (name: string) => `@${FAKE_OWNER}/${name}`

/** Every button the owner's project page has. None may be on the public view. */
const OWNER_ACTIONS = /scan now|check this one|mark as reviewed|retry|undo/i

// ---------------------------------------------------------------- helpers

function dependencyRow(scope: Page | Locator, packageName: string): Locator {
  return scope.locator(`[data-testid="dependency-row"][data-package="${packageName}"]`)
}

/** Adds the demo project as this user and waits on its page until the scan has finished. */
async function addScannedProject(page: Page): Promise<string> {
  const projectId = await addProject(page, DEMO)
  await page.goto(`/projects/${projectId}`)
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(dependencyRow(page, fake('router'))).toHaveAttribute('data-state', 'breaking', { timeout: 15_000 })
  return projectId
}

async function setVisibility(page: Page, projectId: string, visibility: 'public' | 'private') {
  const answer = await callAction(page, 'set-visibility', { projectId, visibility })
  expect(answer.success, answer.error).toBe(true)
}

/** Opens a share link and waits for the public report to be drawn, verdicts included. */
async function openPublicReport(page: Page, projectId: string) {
  await page.goto(`/share/${projectId}`)
  await expect(page.getByTestId('public-report')).toBeVisible({ timeout: 15_000 })
  await expect(dependencyRow(page, fake('router'))).toHaveAttribute('data-state', 'breaking', { timeout: 15_000 })
}

/** Who a signed-in test user is, as the platform knows them: the id is the token's subject. */
async function identityOf(user: { page: Page; email: string; name: string }) {
  const token = await authToken(user.page)
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { sub?: string }
  if (!claims.sub) throw new Error('the test account token has no subject')
  return { id: claims.sub, email: user.email, name: user.name }
}

/**
 * Records everything the page receives from the app's server from now on:
 * every frame on a room WebSocket, and the body of every /api/ response.
 * Call before navigating. `received()` gives it back as text.
 */
function recordWire(page: Page) {
  const frames: string[] = []
  const bodies: Promise<void>[] = []
  page.on('websocket', (socket) => {
    if (!new URL(socket.url()).pathname.startsWith('/ws/')) return // vite's own socket
    socket.on('framereceived', (frame) => {
      frames.push(typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8'))
    })
  })
  page.on('response', (response) => {
    if (!new URL(response.url()).pathname.startsWith('/api/')) return
    bodies.push(
      response
        .text()
        .then((text) => void frames.push(text))
        .catch(() => {}),
    )
  })
  return {
    /** Everything received, as one text. */
    async received(): Promise<string> {
      await Promise.all(bodies)
      return frames.join('\n')
    },
    /** Every record received, in any message: anything shaped `{ recordId, data }`. */
    async records(): Promise<WireRecord[]> {
      await Promise.all(bodies)
      const found: WireRecord[] = []
      const walk = (value: unknown) => {
        if (Array.isArray(value)) return value.forEach(walk)
        if (value === null || typeof value !== 'object') return
        const object = value as Record<string, unknown>
        if (typeof object.recordId === 'string' && typeof object.data === 'object' && object.data !== null) {
          found.push(object as unknown as WireRecord)
        }
        Object.values(object).forEach(walk)
      }
      for (const frame of frames) {
        try {
          walk(JSON.parse(frame))
        } catch {
          // Not JSON (an empty body, say): nothing to find in it.
        }
      }
      return found
    },
  }
}

/** The page fits its window: nothing forces a sideways scroll. */
async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.documentElement
    return Math.max(main.scrollWidth - main.clientWidth, document.documentElement.scrollWidth - window.innerWidth)
  })
  expect(overflow, 'pixels of sideways overflow').toBeLessThanOrEqual(0)
}

/**
 * Evidence for the ticket: a capture taken with `npx deepspace test
 * screenshot`, which cannot sign in and so shows what a signed-out visitor
 * gets. Only when BUMPCHECK_EVIDENCE is set, so a normal gate run does not
 * start a second browser.
 */
function cliScreenshot(page: Page, path: string, name: string, viewport = '1280x900') {
  if (!process.env.BUMPCHECK_EVIDENCE) return
  mkdirSync(process.env.BUMPCHECK_EVIDENCE, { recursive: true })
  const url = new URL(path, page.url()).toString()
  execFileSync(
    'npx',
    ['deepspace', 'test', 'screenshot', url, `${process.env.BUMPCHECK_EVIDENCE}/${name}`, '--full-page', `--viewport=${viewport}`, '--wait-for-timeout=4000'],
    { stdio: 'inherit' },
  )
}

// ------------------------------------------------------------------ tests

test('a project is private until its owner switches it to public on the settings page, which then shows the link', async ({ users, page: visitor }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addScannedProject(alice.page)
  const page = alice.page

  // Private by default: the link leads nowhere yet.
  await visitor.goto(`/share/${projectId}`)
  await expect(visitor.getByTestId('public-report-not-available')).toBeVisible({ timeout: 15_000 })

  // The owner's page links to the project's settings.
  await page.getByTestId('project-settings-link').click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings$`))
  const settings = page.getByTestId('project-settings')
  await expect(settings).toBeVisible({ timeout: 15_000 })
  await expect(settings.getByRole('heading', { level: 1 })).toContainText(DEMO)

  const publicSwitch = page.getByRole('switch', { name: 'Public report' })
  await expect(publicSwitch).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('visibility-state')).toContainText('Private')
  await expect(page.getByTestId('share-link')).toHaveCount(0)
  await page.screenshot({ path: capturePath('settings-private.png'), fullPage: true })

  await publicSwitch.click()
  await expect(publicSwitch).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })
  await expect(page.getByTestId('visibility-state')).toContainText('Public')
  const link = page.getByTestId('share-link')
  await expect(link).toBeVisible()
  const origin = new URL(page.url()).origin
  await expect(link).toHaveAttribute('href', `${origin}/share/${projectId}`)
  await expect(link).toHaveText(`${origin}/share/${projectId}`)
  await page.waitForTimeout(400) // the switch slides over; capture it at rest
  await page.screenshot({ path: capturePath('settings-public.png'), fullPage: true })

  // The setting is stored, not just shown: it is still on after a reload.
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Public report' })).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })

  // The link now works for someone who is not signed in.
  await visitor.goto(await page.getByTestId('share-link').getAttribute('href').then(String))
  await expect(visitor.getByTestId('public-report')).toBeVisible({ timeout: 15_000 })

  // The settings page fits a narrow window.
  await page.setViewportSize({ width: 380, height: 800 })
  await expectNoSidewaysScroll(page)
  await page.screenshot({ path: capturePath('settings-public-narrow.png'), fullPage: true })
})

test('a public report is readable signed-out, offers no actions, and what the reader received names nobody', async ({ users, page: visitor }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addScannedProject(alice.page)
  // Alice reviews one verdict: her review state must not travel with the public report.
  const routerKey = `${fake('router')}@4->5.1`
  expect((await callAction(alice.page, 'mark-reviewed', { projectId, verdictKey: routerKey })).success).toBe(true)
  await setVisibility(alice.page, projectId, 'public')
  const who = await identityOf(alice)

  // Control: the recorder does see an owner id when one is sent. Alice's own page receives her project row.
  const aliceWire = recordWire(alice.page)
  await alice.page.reload()
  await expect(alice.page.getByTestId('project-page')).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => (await aliceWire.received()).includes(who.id)).toBe(true)

  // The signed-out visitor opens the link. Everything the server sends from here on is recorded.
  const wire = recordWire(visitor)
  await openPublicReport(visitor, projectId)

  // Readable: the same report, grouped the same way.
  const report = visitor.getByTestId('public-report')
  await expect(report.getByRole('heading', { level: 1 })).toHaveText(DEMO)
  await expect(report).toHaveAttribute('data-scan-status', 'done')
  await expect(visitor.getByTestId('group-runtime')).toBeVisible()
  await expect(visitor.getByTestId('group-dev')).toBeVisible()
  await expect(visitor.getByTestId('dependency-row')).toHaveCount(10)
  await expect(dependencyRow(visitor, fake('router')).getByTestId('verdict-change').first()).toBeVisible()
  await expect(dependencyRow(visitor, fake('colors'))).toHaveAttribute('data-state', 'not-read')
  // Review state is the owner's: the public page has no "reviewed" section, and router is listed as breaking.
  await expect(visitor.getByTestId('reviewed-section')).toHaveCount(0)
  await expect(dependencyRow(visitor.getByTestId('group-runtime'), fake('router'))).toBeVisible()
  await expect(visitor.getByTestId('unreviewed-breaking')).toHaveText('2 breaking upgrades.')

  // No actions: none of the owner's buttons, and no way to the settings.
  await expect(report.getByRole('button', { name: OWNER_ACTIONS })).toHaveCount(0)
  await expect(visitor.locator('main').getByRole('button', { name: OWNER_ACTIONS })).toHaveCount(0)
  await expect(visitor.getByTestId('project-settings-link')).toHaveCount(0)
  // Not in the report, and not in the bar above it: a signed-out reader is offered sign-in and nothing else.
  await expect(visitor.locator('a[href*="/settings"]')).toHaveCount(0)
  await expect(visitor.locator('a[href^="/projects"]')).toHaveCount(0)
  await expect(visitor.getByTestId('nav-sign-in-button')).toBeVisible()
  // The only buttons in the report open and close a verdict's list of changes.
  const buttons = await report.getByRole('button').allTextContents()
  expect(buttons.length).toBeGreaterThan(0)
  for (const text of buttons) expect(text).toMatch(/^(Show|Hide) \d+ changes?$/)
  await visitor.screenshot({ path: capturePath('public-report.png'), fullPage: true })

  // What arrived over the wire. First, that the recording is of the real thing: it holds the report.
  await visitor.waitForTimeout(1000)
  const received = await wire.received()
  expect(received).toContain('"publicReports"')
  expect(received).toContain(fake('router'))
  // Then: nothing in it identifies Alice. Not her id, not her email, not her name.
  expect(received).not.toContain(who.id)
  expect(received.toLowerCase()).not.toContain(who.email.toLowerCase())
  expect(received).not.toContain(who.name)
  // Record by record: the report arrived with exactly its public columns, and no record has an owner column.
  const records = await wire.records()
  const reportRecords = records.filter((record) => record.recordId === projectId)
  expect(reportRecords.length).toBeGreaterThan(0)
  for (const record of reportRecords) {
    expect(Object.keys(record.data).sort()).toEqual([...PUBLIC_REPORT_COLUMNS].sort())
    expect(record.createdBy).not.toBe(who.id)
  }
  for (const record of records) {
    for (const column of ['userId', 'reviewedKeys', 'alertsEnabled', 'alertedKeys', 'visibility']) expect(record.data).not.toHaveProperty(column)
  }
  // And the page does not show them either.
  const text = await visitor.locator('body').innerText()
  expect(text).not.toContain(who.email)
  expect(text).not.toContain(who.name)

  // The server's own answer to a signed-out visitor, with no page code in between.
  const reports = await askRecordRoom(visitor, null, 'publicReports')
  const mine = reports.records.filter((record) => record.recordId === projectId)
  expect(mine).toHaveLength(1)
  expect(Object.keys(mine[0].data).sort()).toEqual([...PUBLIC_REPORT_COLUMNS].sort())
  expect(mine[0].createdBy).not.toBe(who.id)
  expect(reports.raw).not.toContain(who.id)
  // The project row itself is not sent to anyone but its owner, public or not.
  const projects = await askRecordRoom(visitor, null, 'projects')
  expect(projects.records).toEqual([])
  expect(projects.raw).not.toContain(who.id)

  // A narrow window does not break the page.
  await visitor.setViewportSize({ width: 380, height: 800 })
  await expectNoSidewaysScroll(visitor)
  await visitor.screenshot({ path: capturePath('public-report-narrow.png'), fullPage: true })

  cliScreenshot(visitor, `/share/${projectId}`, 'public-report.png', '1280x2700')
  cliScreenshot(visitor, `/share/${projectId}`, 'public-report-narrow.png', '380x800')
})

test('another signed-in user reads a public report the same way: no actions, no owner', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  await resetProjects(alice.page)
  await resetProjects(bob.page)
  const projectId = await addScannedProject(alice.page)
  await setVisibility(alice.page, projectId, 'public')
  const who = await identityOf(alice)

  await openPublicReport(bob.page, projectId)
  await expect(bob.page.locator('main').getByRole('button', { name: OWNER_ACTIONS })).toHaveCount(0)
  await expect(bob.page.getByTestId('project-settings-link')).toHaveCount(0)

  // Bob's own connection: he gets the public report without Alice in it, and not her project row.
  const bobToken = await authToken(bob.page)
  const reports = await askRecordRoom(bob.page, bobToken, 'publicReports')
  expect(reports.records.map((record) => record.recordId)).toContain(projectId)
  expect(reports.raw).not.toContain(who.id)
  const projects = await askRecordRoom(bob.page, bobToken, 'projects')
  expect(projects.records).toEqual([])
  expect(projects.raw).not.toContain(who.id)

  // Being public does not let Bob act. The owner's page and settings stay closed to him too.
  for (const [name, params] of [
    ['scan-now', { projectId }],
    ['mark-reviewed', { projectId, verdictKey: `${fake('router')}@4->5.1` }],
    ['check-dependency', { projectId, packageName: fake('colors') }],
    ['set-visibility', { projectId, visibility: 'private' }],
  ] as const) {
    expect(await callAction(bob.page, name, params), name).toMatchObject({ success: false, error: 'Project not found.' })
  }
  await bob.page.goto(`/projects/${projectId}`)
  await expect(bob.page.getByTestId('project-not-available')).toBeVisible({ timeout: 15_000 })
  await bob.page.goto(`/projects/${projectId}/settings`)
  await expect(bob.page.getByTestId('project-not-available')).toBeVisible({ timeout: 15_000 })
  await expect(bob.page.getByRole('switch')).toHaveCount(0)
})

test('nobody but the user themself reads their name or email from the users collection; the nav still shows your own', async ({ users, page: visitor }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  const aliceIs = await identityOf(alice)
  const bobIs = await identityOf(bob)

  // Each signed-in page shows its own account in the nav's identity chip.
  for (const [user, who] of [
    [alice, aliceIs],
    [bob, bobIs],
  ] as const) {
    await user.page.goto('/projects')
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(who.name, { timeout: 15_000 })
    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(who.email)
    await user.page.keyboard.press('Escape')
  }

  // Bob, a member, asks the record room directly: the users rows, and the roster.
  const bobToken = await authToken(bob.page)
  const rows = await askRecordRoom(bob.page, bobToken, 'users')
  expect(rows.records.map((record) => record.recordId)).toEqual([bobIs.id])
  const roster = await askUserList(bob.page, bobToken)
  expect(roster.users.map((user) => user.id)).toEqual([bobIs.id])
  for (const raw of [rows.raw, roster.raw]) {
    expect(raw).not.toContain(aliceIs.id)
    expect(raw).not.toContain(aliceIs.email)
    expect(raw).not.toContain(aliceIs.name)
  }

  // A signed-out visitor gets no one at all.
  await visitor.goto('/share/nothing-here')
  await expect(visitor.getByTestId('public-report-not-available')).toBeVisible({ timeout: 15_000 })
  const visitorRows = await askRecordRoom(visitor, null, 'users')
  expect(visitorRows.records).toEqual([])
  const visitorRoster = await askUserList(visitor, null)
  expect(visitorRoster.users).toEqual([])
  for (const raw of [visitorRows.raw, visitorRoster.raw]) {
    for (const who of [aliceIs, bobIs]) {
      expect(raw).not.toContain(who.id)
      expect(raw).not.toContain(who.email)
      expect(raw).not.toContain(who.name)
    }
  }
})

test('a private project\'s link shows "not available", signed-out and to Bob, exactly like a link to nothing', async ({ users, page: visitor }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  await resetProjects(alice.page)
  await resetProjects(bob.page)
  const projectId = await addScannedProject(alice.page)
  const who = await identityOf(alice)

  /** Opens a share link and returns the "not available" panel's words. */
  const notAvailableText = async (page: Page, id: string) => {
    await page.goto(`/share/${id}`)
    const panel = page.getByTestId('public-report-not-available')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('public-report')).toHaveCount(0)
    await expect(page.getByTestId('dependency-row')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('demo')
    return panel.innerText()
  }

  // Signed out: a clear page, not a blank one, and not the sign-in wall.
  const wire = recordWire(visitor)
  const forPrivate = await notAvailableText(visitor, projectId)
  expect(forPrivate).toContain('not available')
  await visitor.screenshot({ path: capturePath('public-report-not-available.png'), fullPage: true })
  // Nothing about the project was sent: no record with a repo in it, and not its owner.
  await visitor.waitForTimeout(1000)
  const received = await wire.received()
  expect(received).toContain('core.query_result') // the recording is of the real thing
  expect(received).not.toContain(who.id)
  for (const record of await wire.records()) {
    expect(record.recordId).not.toBe(projectId)
    expect(record.data).not.toHaveProperty('repoName')
    expect(record.data).not.toHaveProperty('userId')
  }
  // The same words as for an id that never existed, so the page does not say which it is.
  expect(await notAvailableText(visitor, 'no-such-project')).toBe(forPrivate)

  // Bob, signed in: the same.
  expect(await notAvailableText(bob.page, projectId)).toBe(forPrivate)
  expect(await notAvailableText(bob.page, 'no-such-project')).toBe(forPrivate)

  // The server's own answer: no public report, and no project row, for either of them.
  for (const [page, token] of [
    [visitor, null],
    [bob.page, await authToken(bob.page)],
  ] as const) {
    expect((await askRecordRoom(page, token, 'publicReports')).records.filter((record) => record.recordId === projectId)).toEqual([])
    const projects = await askRecordRoom(page, token, 'projects')
    expect(projects.records).toEqual([])
    expect(projects.raw).not.toContain(who.id)
  }

  await visitor.setViewportSize({ width: 380, height: 800 })
  await expectNoSidewaysScroll(visitor)
  cliScreenshot(visitor, `/share/${projectId}`, 'not-available.png')
})

test('switching back to private removes access, even from a page that is already open', async ({ users, page: visitor }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  await resetProjects(alice.page)
  await resetProjects(bob.page)
  const projectId = await addScannedProject(alice.page)
  await setVisibility(alice.page, projectId, 'public')

  await openPublicReport(visitor, projectId)
  await openPublicReport(bob.page, projectId)

  // Alice switches it off, with the switch.
  await alice.page.goto(`/projects/${projectId}/settings`)
  const publicSwitch = alice.page.getByRole('switch', { name: 'Public report' })
  await expect(publicSwitch).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })
  await publicSwitch.click()
  await expect(publicSwitch).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })
  await expect(alice.page.getByTestId('share-link')).toHaveCount(0)

  // The open pages lose the report without a reload.
  for (const page of [visitor, bob.page]) {
    await expect(page.getByTestId('public-report-not-available')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('dependency-row')).toHaveCount(0)
  }
  // And it is gone from the server, not just from those pages.
  for (const [page, token] of [
    [visitor, null],
    [bob.page, await authToken(bob.page)],
  ] as const) {
    await page.reload()
    await expect(page.getByTestId('public-report-not-available')).toBeVisible({ timeout: 15_000 })
    expect((await askRecordRoom(page, token, 'publicReports')).records.filter((record) => record.recordId === projectId)).toEqual([])
  }

  // Alice still has her project, with its report.
  await alice.page.goto(`/projects/${projectId}`)
  await expect(alice.page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 15_000 })
  await expect(alice.page.getByTestId('dependency-row')).toHaveCount(10)
})

test('only the owner can change who sees a project', async ({ users, page: visitor, request }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  await resetProjects(alice.page)
  await resetProjects(bob.page)
  const projectId = await addScannedProject(alice.page)

  // Bob cannot publish Alice's private project. He gets the answer a missing project gets.
  expect(await callAction(bob.page, 'set-visibility', { projectId, visibility: 'public' })).toMatchObject({
    success: false,
    error: 'Project not found.',
  })
  expect(await callAction(bob.page, 'set-visibility', { projectId: 'no-such-project', visibility: 'public' })).toMatchObject({
    success: false,
    error: 'Project not found.',
  })
  await visitor.goto(`/share/${projectId}`)
  await expect(visitor.getByTestId('public-report-not-available')).toBeVisible({ timeout: 15_000 })
  expect((await askRecordRoom(visitor, null, 'publicReports')).records.filter((record) => record.recordId === projectId)).toEqual([])

  // Nobody at all without a sign-in.
  const noToken = await request.post('/api/actions/set-visibility', { data: { projectId, visibility: 'public' } })
  expect(noToken.status()).toBe(401)

  // Only "public" and "private" are accepted, and a refused value changes nothing.
  for (const visibility of ['everyone', '', null, true]) {
    expect(await callAction(alice.page, 'set-visibility', { projectId, visibility }), String(visibility)).toMatchObject({ success: false })
  }
  expect((await askRecordRoom(visitor, null, 'publicReports')).records.filter((record) => record.recordId === projectId)).toEqual([])

  // Alice publishes it. Bob cannot take it back to private either.
  await setVisibility(alice.page, projectId, 'public')
  expect(await callAction(bob.page, 'set-visibility', { projectId, visibility: 'private' })).toMatchObject({
    success: false,
    error: 'Project not found.',
  })
  await openPublicReport(visitor, projectId)

  // Clients cannot write the public copy directly: the record room refuses, for a member and for a visitor.
  await bob.page.goto('/projects')
  for (const [page, token] of [
    [bob.page, await authToken(bob.page)],
    [visitor, null],
  ] as const) {
    await page.evaluate(
      async ({ room, token, projectId }) => {
        const url = new URL(`/ws/${encodeURIComponent(room)}`, window.location.origin)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        if (token) url.searchParams.set('token', token)
        const socket = new WebSocket(url)
        await new Promise<void>((resolve) => (socket.onopen = () => resolve()))
        await new Promise((resolve) => setTimeout(resolve, 500))
        socket.send(JSON.stringify({ type: 'core.delete', payload: { collection: 'publicReports', recordId: projectId, requestId: 'd1' } }))
        socket.send(
          JSON.stringify({
            type: 'core.put',
            payload: { collection: 'publicReports', recordId: 'forged', data: { projectId: 'forged', repoOwner: 'x', repoName: 'y' }, requestId: 'p1' },
          }),
        )
        await new Promise((resolve) => setTimeout(resolve, 1000))
        socket.close()
      },
      { room: RECORD_ROOM, token, projectId },
    )
  }
  const after = (await askRecordRoom(visitor, null, 'publicReports')).records.map((record) => record.recordId)
  expect(after).toContain(projectId)
  expect(after).not.toContain('forged')
})

test('a public report follows its project: a check that finishes shows up for the reader', async ({ users, page: visitor }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addScannedProject(alice.page)
  await setVisibility(alice.page, projectId, 'public')

  await openPublicReport(visitor, projectId)
  const colors = dependencyRow(visitor, fake('colors'))
  await expect(colors).toHaveAttribute('data-state', 'not-read')

  // Alice has the minor upgrade read. When that job ends, the public report is written again.
  await dependencyRow(alice.page, fake('colors')).getByRole('button', { name: 'Check this one' }).click()
  await expect(dependencyRow(alice.page, fake('colors'))).toHaveAttribute('data-state', 'safe', { timeout: 30_000 })

  // The reader sees it without a reload, and still has no button to ask for anything.
  await expect(colors).toHaveAttribute('data-state', 'safe', { timeout: 15_000 })
  await expect(visitor.locator('main').getByRole('button', { name: OWNER_ACTIONS })).toHaveCount(0)
})

test('the landing page says what bumpcheck does, links to the example report, and offers sign-in', async ({ users, page: visitor }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addScannedProject(alice.page)
  // The local fixture: a copy of Alice's report under the example id (test-only action).
  const fixture = await callAction(alice.page, 'test-publish-example', { projectId })
  expect(fixture.success, fixture.error).toBe(true)

  await visitor.goto('/')
  const landing = visitor.getByTestId('static-landing')
  await expect(landing).toBeVisible({ timeout: 15_000 })
  await expect(landing.getByRole('heading', { level: 1 })).toContainText('bumpcheck')
  await expect(visitor.getByTestId('landing-pitch')).toContainText(/which .*upgrades will break/i)
  await expect(landing).not.toContainText('DeepSpace app')

  // Sign-in with GitHub or Google: plain links to the app's own sign-in route.
  await expect(landing.getByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute('href', '/api/auth/social-redirect?provider=github')
  await expect(landing.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute('href', '/api/auth/social-redirect?provider=google')
  await visitor.screenshot({ path: capturePath('landing.png'), fullPage: true })

  await visitor.setViewportSize({ width: 380, height: 800 })
  await expectNoSidewaysScroll(visitor)
  await visitor.screenshot({ path: capturePath('landing-narrow.png'), fullPage: true })
  cliScreenshot(visitor, '/', 'landing.png')
  cliScreenshot(visitor, '/', 'landing-narrow.png', '380x800')
  await visitor.setViewportSize({ width: 1280, height: 720 })

  // The example link opens a real public report without signing in.
  await landing.getByRole('link', { name: /example report/i }).click()
  await expect(visitor).toHaveURL(new RegExp(`/share/${EXAMPLE_PROJECT_ID}$`))
  await expect(visitor.getByTestId('public-report')).toBeVisible({ timeout: 15_000 })
  await expect(visitor.getByTestId('public-report').getByRole('heading', { level: 1 })).toHaveText(DEMO)
  await expect(dependencyRow(visitor, fake('router'))).toHaveAttribute('data-state', 'breaking', { timeout: 15_000 })
  await expect(visitor.locator('main').getByRole('button', { name: OWNER_ACTIONS })).toHaveCount(0)
  // A visitor who likes what they see can sign in from here.
  await expect(visitor.getByTestId('nav-sign-in-button')).toBeVisible()
})

test('the test-only example fixture is not an open door', async ({ request }) => {
  const noToken = await request.post('/api/actions/test-publish-example', { data: { projectId: 'x' } })
  expect(noToken.status()).toBe(401)
})

test('nothing public is left behind', async ({ users, page: visitor }) => {
  // The local record room keeps its rows between runs: empty both accounts,
  // and check that their public reports and the example fixture went with them.
  const [alice, bob] = await users(['Alice', 'Bob'])
  await resetProjects(alice.page)
  await resetProjects(bob.page)
  await visitor.goto(`/share/${EXAMPLE_PROJECT_ID}`)
  await expect(visitor.getByTestId('public-report-not-available')).toBeVisible({ timeout: 15_000 })
  expect((await askRecordRoom(visitor, null, 'publicReports')).records).toEqual([])
})
