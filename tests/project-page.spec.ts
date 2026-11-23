/**
 * Signed-in flows for the project page (ticket 03), against fake services.
 *
 * Repos, packages and the judge's answers come from
 * src/services/fake-world.ts: `bumpcheck-fake/demo` has one dependency in
 * every state the page can show. Records are real (the local record room),
 * so each test starts by emptying them.
 *
 * Accounts: Alice and Bob, ordinary members, not the app owner.
 */

import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Locator, Page } from '@playwright/test'
import { FAKE_OWNER } from '../src/services/fake-world'
import { addProject, callAction, capturePath, openProjects, projectRow, resetProjects } from './helpers/app'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs the 2 test accounts (Alice and Bob), found ${usableTestAccounts}.`)

// The tests share one account's project list, so they must not interleave.
// Tests in one file already run one after another in one worker; "serial"
// mode is not used because it would also skip every test after a failure.

const DEMO = `${FAKE_OWNER}/demo`
const fake = (name: string) => `@${FAKE_OWNER}/${name}`

// ---------------------------------------------------------------- helpers

/** Opens a project's page and waits until its scan has finished. */
async function openScannedProject(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`)
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  // Verdicts load separately from the project row; wait for one to be on the page.
  await expect(dependencyRow(page, fake('router'))).toHaveAttribute('data-state', 'breaking', { timeout: 15_000 })
}

function dependencyRow(scope: Page | Locator, packageName: string): Locator {
  return scope.locator(`[data-testid="dependency-row"][data-package="${packageName}"]`)
}

function group(page: Page, name: 'runtime' | 'dev'): Locator {
  return page.getByTestId(`group-${name}`)
}

/** "section: package, package" for each section of a group, in page order. */
async function layout(page: Page, name: 'runtime' | 'dev'): Promise<string[]> {
  return group(page, name)
    .locator('[data-testid="report-section"]')
    .evaluateAll((sections) =>
      sections.map((section) => {
        const rows = [...section.querySelectorAll('[data-testid="dependency-row"]')]
        const names = rows.map((row) => (row.getAttribute('data-package') ?? '').replace('@bumpcheck-fake/', ''))
        return `${section.getAttribute('data-section')}: ${names.join(', ')}`
      }),
    )
}

/**
 * A capture of the whole page. The app scrolls inside <main>, so the window
 * is made tall enough to show all of it first.
 */
async function captureWhole(page: Page, name: string, width = 1280) {
  const before = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.setViewportSize({ width, height: before.height })
  const needed = await page.evaluate(() => {
    const main = document.querySelector('main')
    return main ? main.scrollHeight + (window.innerHeight - main.clientHeight) : document.body.scrollHeight
  })
  await page.setViewportSize({ width, height: Math.max(needed, 400) })
  await page.screenshot({ path: capturePath(name) })
  await page.setViewportSize(before)
}

// ------------------------------------------------------------------ tests

test('the report sorts every dependency into its group and section, each in its own state', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  await addProject(alice.page, DEMO)

  // Reached the way a user does: from the projects list.
  await openProjects(alice.page)
  await projectRow(alice.page, DEMO).getByRole('link', { name: DEMO }).click()
  await expect(alice.page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(dependencyRow(alice.page, fake('router'))).toHaveAttribute('data-state', 'breaking', { timeout: 15_000 })
  const page = alice.page

  // Runtime and dev are separate groups; inside each, the sections come in the spec's order.
  expect(await layout(page, 'runtime')).toEqual([
    'breaking: big, router',
    'unclear: dates',
    'minor-patch: colors',
    'up-to-date: tiny',
    'not-checked: local-thing',
  ])
  expect(await layout(page, 'dev')).toEqual(['unclear: types, garbled', 'safe-major: test-runner', 'minor-patch: lint'])

  // Each outdated dependency shows the version it is on and the one available, in monospace.
  const router = dependencyRow(page, fake('router'))
  await expect(router.getByTestId('versions')).toHaveText('4.18.0 → 5.1.0')
  await expect(router.getByTestId('versions')).toHaveCSS('font-family', /mono/i)
  await expect(router.getByTestId('package-name')).toHaveCSS('font-family', /mono/i)

  // A breaking verdict lists each change: what changed and what to do, and links to its changelog.
  const details = router.getByTestId('verdict-details')
  await expect(details).toBeVisible()
  await expect(details.getByTestId('verdict-change')).toHaveCount(2)
  await expect(details).toContainText('app.del() removed')
  await expect(details).toContainText('`app.del()` no longer exists.')
  await expect(details).toContainText('Call `app.delete()` instead.')
  await expect(details.getByRole('link', { name: /changelog/i })).toHaveAttribute(
    'href',
    `https://github.com/${FAKE_OWNER}/router/blob/HEAD/CHANGELOG.md`,
  )

  // The changelog that was too long says so.
  const big = dependencyRow(page, fake('big'))
  await expect(big).toHaveAttribute('data-state', 'breaking')
  await expect(big.getByTestId('changelog-cut-notice')).toContainText('cut')
  await expect(router.getByTestId('changelog-cut-notice')).toHaveCount(0)

  // No changelog: its own state, with a link to the releases page.
  const dates = dependencyRow(page, fake('dates'))
  await expect(dates).toHaveAttribute('data-state', 'no-changelog')
  await expect(dates).toContainText('No changelog found')
  await expect(dates.getByRole('link', { name: /releases page/i })).toHaveAttribute(
    'href',
    `https://github.com/${FAKE_OWNER}/dates/releases`,
  )

  // Unclear, failed (with retry), safe major.
  await expect(dependencyRow(page, fake('types'))).toHaveAttribute('data-state', 'unclear')
  await expect(dependencyRow(page, fake('types')).getByTestId('state-badge')).toHaveText('Unclear')
  const garbled = dependencyRow(page, fake('garbled'))
  await expect(garbled).toHaveAttribute('data-state', 'failed')
  await expect(garbled.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(dependencyRow(page, fake('test-runner')).getByTestId('state-badge')).toHaveText('Safe')

  // Minor and patch upgrades are "not read", never "safe", and can be checked on request.
  for (const name of ['colors', 'lint']) {
    const row = dependencyRow(page, fake(name))
    await expect(row).toHaveAttribute('data-state', 'not-read')
    await expect(row.getByTestId('state-badge')).toHaveText('Not read')
    await expect(row.getByRole('button', { name: 'Check this one' })).toBeVisible()
  }

  // Up to date, and not checked (with the reason).
  await expect(dependencyRow(page, fake('tiny')).getByTestId('state-badge')).toHaveText('Up to date')
  const local = dependencyRow(page, 'local-thing')
  await expect(local.getByTestId('state-badge')).toHaveText('Not checked')
  await expect(local).toContainText('local path')

  await captureWhole(page, 'project-finished-breaking-expanded.png')

  // A narrow window: nothing spills sideways.
  await page.setViewportSize({ width: 380, height: 800 })
  await expect(router.getByTestId('versions')).toBeVisible()
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')!
    return { main: main.scrollWidth - main.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth }
  })
  expect(overflow.main).toBeLessThanOrEqual(1)
  expect(overflow.page).toBeLessThanOrEqual(1)
  await captureWhole(page, 'project-narrow.png', 380)
})

test('a verdict is marked as reviewed, moves to the collapsed section, and undo brings it back', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, DEMO)
  const page = alice.page
  await openScannedProject(page, projectId)

  await expect(page.getByTestId('unreviewed-breaking')).toContainText('2 breaking')
  await expect(page.getByTestId('reviewed-section')).toHaveCount(0)

  await dependencyRow(page, fake('router')).getByRole('button', { name: 'Mark as reviewed' }).click()

  // It leaves its group, and the reviewed section appears, collapsed.
  await expect(dependencyRow(group(page, 'runtime'), fake('router'))).toHaveCount(0)
  expect((await layout(page, 'runtime'))[0]).toBe('breaking: big')
  const reviewed = page.getByTestId('reviewed-section')
  await expect(reviewed.getByRole('button', { name: 'Reviewed (1)' })).toHaveAttribute('aria-expanded', 'false')
  await expect(dependencyRow(reviewed, fake('router'))).toHaveCount(0)
  await expect(page.getByTestId('unreviewed-breaking')).toContainText('1 breaking')

  // Opened, it shows the verdict with an undo.
  await reviewed.getByRole('button', { name: 'Reviewed (1)' }).click()
  await expect(dependencyRow(reviewed, fake('router'))).toBeVisible()
  await expect(dependencyRow(reviewed, fake('router')).getByRole('button', { name: 'Undo' })).toBeVisible()
  await captureWhole(page, 'project-reviewed-open.png')

  // It was written by the server: still reviewed after a reload.
  await page.reload()
  await expect(page.getByTestId('reviewed-section').getByRole('button', { name: 'Reviewed (1)' })).toBeVisible({ timeout: 15_000 })
  await expect(dependencyRow(group(page, 'runtime'), fake('router'))).toHaveCount(0)

  // Undo brings it back to where it was.
  await page.getByTestId('reviewed-section').getByRole('button', { name: 'Reviewed (1)' }).click()
  await dependencyRow(page.getByTestId('reviewed-section'), fake('router')).getByRole('button', { name: 'Undo' }).click()
  await expect(dependencyRow(group(page, 'runtime'), fake('router'))).toBeVisible()
  expect((await layout(page, 'runtime'))[0]).toBe('breaking: big, router')
  await expect(page.getByTestId('reviewed-section')).toHaveCount(0)
  await expect(page.getByTestId('unreviewed-breaking')).toContainText('2 breaking')
})

test('the server refuses to review a verdict that is not in the project, or a failed one', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, DEMO)
  await openScannedProject(alice.page, projectId)

  const notMine = await callAction(alice.page, 'mark-reviewed', { projectId, verdictKey: 'express@4->5.1' })
  expect(notMine).toMatchObject({ success: false, error: "That verdict is not part of this project's report." })

  const failedKey = `${fake('garbled')}@1->2.0`
  const failed = await callAction(alice.page, 'mark-reviewed', { projectId, verdictKey: failedKey })
  expect(failed).toMatchObject({ success: false, error: 'A failed verdict cannot be reviewed. Retry it instead.' })

  await alice.page.reload()
  await expect(alice.page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 15_000 })
  await expect(dependencyRow(alice.page, fake('garbled'))).toHaveAttribute('data-state', 'failed', { timeout: 15_000 })
  await expect(alice.page.getByTestId('reviewed-section')).toHaveCount(0)
})

test('a change made in one tab appears in a second tab', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, DEMO)

  const first = alice.page
  const second = await first.context().newPage()
  await openScannedProject(first, projectId)
  await openScannedProject(second, projectId)
  await expect(second.getByTestId('reviewed-section')).toHaveCount(0)

  // Reviewed in the first tab: the second shows it without a reload.
  await dependencyRow(first, fake('router')).getByRole('button', { name: 'Mark as reviewed' }).click()
  await expect(second.getByTestId('reviewed-section').getByRole('button', { name: 'Reviewed (1)' })).toBeVisible({ timeout: 10_000 })
  await expect(dependencyRow(group(second, 'runtime'), fake('router'))).toHaveCount(0)
  await expect(second.getByTestId('unreviewed-breaking')).toContainText('1 breaking')

  // And undone in the second: the first shows that too.
  await second.getByTestId('reviewed-section').getByRole('button', { name: 'Reviewed (1)' }).click()
  await dependencyRow(second.getByTestId('reviewed-section'), fake('router')).getByRole('button', { name: 'Undo' }).click()
  await expect(dependencyRow(group(first, 'runtime'), fake('router'))).toBeVisible({ timeout: 10_000 })
  await expect(first.getByTestId('reviewed-section')).toHaveCount(0)
  await second.close()
})

test('the projects list shows each project\'s count of unreviewed breaking upgrades', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const demoId = await addProject(alice.page, DEMO)
  await addProject(alice.page, `${FAKE_OWNER}/second`)

  await openProjects(alice.page)
  const demo = projectRow(alice.page, DEMO)
  const second = projectRow(alice.page, `${FAKE_OWNER}/second`)
  await expect(demo).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(second).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })

  await expect(demo.getByTestId('project-breaking-count')).toHaveText('2 breaking to review')
  await expect(second.getByTestId('project-breaking-count')).toHaveText('Nothing breaking to review')
  await alice.page.screenshot({ path: capturePath('projects-with-counts.png') })

  // Reviewing one lowers the count, live.
  const reviewed = await callAction(alice.page, 'mark-reviewed', { projectId: demoId, verdictKey: `${fake('router')}@4->5.1` })
  expect(reviewed.success, reviewed.error).toBe(true)
  await expect(demo.getByTestId('project-breaking-count')).toHaveText('1 breaking to review')

  const undone = await callAction(alice.page, 'undo-reviewed', { projectId: demoId, verdictKey: `${fake('router')}@4->5.1` })
  expect(undone.success, undone.error).toBe(true)
  await expect(demo.getByTestId('project-breaking-count')).toHaveText('2 breaking to review')
})

test('Bob cannot see Alice\'s private project by URL, and cannot act on it', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  await resetProjects(alice.page)
  await resetProjects(bob.page)
  const projectId = await addProject(alice.page, DEMO)
  await openScannedProject(alice.page, projectId)

  // By URL: a designed "not available" state, not a blank page, a spinner or Alice's data.
  await bob.page.goto(`/projects/${projectId}`)
  await expect(bob.page.getByTestId('project-not-available')).toBeVisible({ timeout: 15_000 })
  await expect(bob.page.getByTestId('project-not-available')).toContainText('not available')
  await expect(bob.page.getByRole('link', { name: 'Back to your projects' })).toBeVisible()
  await bob.page.screenshot({ path: capturePath('project-not-available.png') })
  await expect(bob.page.getByTestId('project-page')).toHaveCount(0)
  await expect(bob.page.getByTestId('dependency-row')).toHaveCount(0)
  await expect(bob.page.locator('main')).not.toContainText('demo')
  await expect(bob.page.locator('main')).not.toContainText('router')

  // Every action checks ownership first and answers as if the project did not exist.
  const routerKey = `${fake('router')}@4->5.1`
  const attempts: Array<[string, Record<string, unknown>]> = [
    ['mark-reviewed', { projectId, verdictKey: routerKey }],
    ['undo-reviewed', { projectId, verdictKey: routerKey }],
    ['check-dependency', { projectId, packageName: fake('colors') }],
    ['retry-verdict', { projectId, packageName: fake('garbled') }],
    ['record-opened', { projectId }],
  ]
  for (const [name, params] of attempts) {
    const answer = await callAction(bob.page, name, params)
    expect(answer, name).toMatchObject({ success: false, error: 'Project not found.' })
  }
  // The same answer for a project that really does not exist.
  expect(await callAction(bob.page, 'mark-reviewed', { projectId: 'no-such-project', verdictKey: routerKey })).toMatchObject({
    success: false,
    error: 'Project not found.',
  })

  // Nothing of Alice's changed: nothing reviewed, nothing checked, no scan started.
  await alice.page.waitForTimeout(1500)
  await expect(alice.page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done')
  await expect(alice.page.getByTestId('reviewed-section')).toHaveCount(0)
  await expect(dependencyRow(group(alice.page, 'runtime'), fake('router'))).toBeVisible()
  await expect(dependencyRow(alice.page, fake('colors'))).toHaveAttribute('data-state', 'not-read')
  const lastOpened = await callAction(alice.page, 'record-opened', { projectId })
  expect(lastOpened.success, lastOpened.error).toBe(true)
})

test('"check this one" reads only that dependency, and progress shows while it runs', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, DEMO)
  const page = alice.page
  await openScannedProject(page, projectId)

  const colors = dependencyRow(page, fake('colors'))
  const garbledBefore = await dependencyRow(page, fake('garbled')).getAttribute('data-decided-at')
  await colors.getByRole('button', { name: 'Check this one' }).click()

  // Mid-check: the progress line is live, from the project row, and the report stays on the page.
  const progress = page.getByTestId('scan-progress')
  await expect(progress).toBeVisible({ timeout: 10_000 })
  await expect(progress).toContainText(`Reading the ${fake('colors')} changelog`, { timeout: 10_000 })
  await expect(dependencyRow(page, fake('router'))).toBeVisible()
  // No second request while one is running.
  await expect(dependencyRow(page, fake('lint')).getByRole('button', { name: 'Check this one' })).toBeDisabled()
  await captureWhole(page, 'project-mid-check.png')

  // Done: colors has its verdict and stays with the minor and patch upgrades.
  await expect(colors).toHaveAttribute('data-state', 'safe', { timeout: 20_000 })
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done')
  await expect(progress).toHaveCount(0)
  await expect(colors.getByTestId('state-badge')).toHaveText('Safe')
  expect(await layout(page, 'runtime')).toContain('minor-patch: colors')

  // Only colors was read: the other unread upgrade is still unread, and the
  // failed verdict was not judged again.
  await expect(dependencyRow(page, fake('lint'))).toHaveAttribute('data-state', 'not-read')
  expect(await dependencyRow(page, fake('garbled')).getAttribute('data-decided-at')).toBe(garbledBefore)

  // The server refuses the requests the page does not offer.
  expect(await callAction(page, 'check-dependency', { projectId, packageName: fake('colors') })).toMatchObject({
    success: false,
    error: 'This upgrade has already been read.',
  })
  expect(await callAction(page, 'check-dependency', { projectId, packageName: fake('router') })).toMatchObject({
    success: false,
    error: 'Only minor and patch upgrades can be checked on request.',
  })
  expect(await callAction(page, 'check-dependency', { projectId, packageName: 'left-pad' })).toMatchObject({
    success: false,
    error: "That package is not one of this project's dependencies.",
  })
  expect(await callAction(page, 'check-dependency', { projectId })).toMatchObject({ success: false })
})

test('a second request while a check is running is refused: one scan at a time', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, DEMO)
  await openScannedProject(alice.page, projectId)

  const first = await callAction(alice.page, 'check-dependency', { projectId, packageName: fake('colors') })
  expect(first.success, first.error).toBe(true)
  const second = await callAction(alice.page, 'check-dependency', { projectId, packageName: fake('lint') })
  expect(second).toMatchObject({ success: false, error: 'A scan is already running for this project. Try again when it finishes.' })
  const retry = await callAction(alice.page, 'retry-verdict', { projectId, packageName: fake('garbled') })
  expect(retry).toMatchObject({ success: false, error: 'A scan is already running for this project. Try again when it finishes.' })

  await expect(dependencyRow(alice.page, fake('colors'))).toHaveAttribute('data-state', 'safe', { timeout: 20_000 })
  await expect(dependencyRow(alice.page, fake('lint'))).toHaveAttribute('data-state', 'not-read')
})

test('a verdict read from a later version is not shown to a project on an older one, until its own check reads the wider range', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const page = alice.page

  // demo is on colors 5.3.0. Its check reads 5.3.0 -> 5.4.1 and stores the verdict.
  const demoId = await addProject(page, DEMO)
  await openScannedProject(page, demoId)
  await dependencyRow(page, fake('colors')).getByRole('button', { name: 'Check this one' }).click()
  await expect(dependencyRow(page, fake('colors'))).toHaveAttribute('data-state', 'safe', { timeout: 20_000 })
  await expect(dependencyRow(page, fake('colors')).getByTestId('verdict-details')).toContainText('5.3.0 → 5.4.1')

  // older is on colors 5.1.0: same verdict key, but the stored verdict skipped 5.1.0 -> 5.3.0.
  const olderId = await addProject(page, `${FAKE_OWNER}/older`)
  await page.goto(`/projects/${olderId}`)
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  const colors = dependencyRow(page, fake('colors'))
  await expect(colors.getByTestId('versions')).toHaveText('5.1.0 → 5.4.1')
  await expect(colors).toHaveAttribute('data-state', 'not-read')

  // Its own check is accepted, and reads from 5.1.0.
  await colors.getByRole('button', { name: 'Check this one' }).click()
  await expect(colors).toHaveAttribute('data-state', 'safe', { timeout: 20_000 })
  await expect(colors.getByTestId('verdict-details')).toContainText('5.1.0 → 5.4.1')

  // The wider verdict replaced the stored one, and still covers demo.
  await page.goto(`/projects/${demoId}`)
  await expect(dependencyRow(page, fake('colors'))).toHaveAttribute('data-state', 'safe', { timeout: 15_000 })
  await expect(dependencyRow(page, fake('colors')).getByTestId('verdict-details')).toContainText('5.1.0 → 5.4.1')
})

test('a check that cannot finish says so, keeps the report, and can be asked again', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, `${FAKE_OWNER}/offline`)
  const page = alice.page
  await page.goto(`/projects/${projectId}`)
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })

  const row = dependencyRow(page, fake('unreachable'))
  await expect(row).toHaveAttribute('data-state', 'not-read')
  await row.getByRole('button', { name: 'Check this one' }).click()

  // The fake GitHub refuses this package's changelog. The job tries twice, then gives up.
  const notice = page.getByTestId('check-failed-notice')
  await expect(notice).toBeVisible({ timeout: 25_000 })
  await expect(notice).toContainText('The check could not finish. Try again later.')
  await page.screenshot({ path: capturePath('project-check-failed.png') })

  // The project is not a failed scan: its report is still there and the check can be asked again.
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done')
  await expect(page.getByTestId('scan-progress')).toHaveCount(0)
  await expect(row).toHaveAttribute('data-state', 'not-read')
  await expect(row.getByRole('button', { name: 'Check this one' })).toBeEnabled()
  const again = await callAction(page, 'check-dependency', { projectId, packageName: fake('unreachable') })
  expect(again.success, again.error).toBe(true)
})

test('a failed verdict has a retry button, and retrying judges that verdict again', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, DEMO)
  const page = alice.page
  await openScannedProject(page, projectId)

  const garbled = dependencyRow(page, fake('garbled'))
  await expect(garbled).toHaveAttribute('data-state', 'failed')
  await expect(garbled).toContainText('could not be read')
  const before = await garbled.getAttribute('data-decided-at')
  const routerBefore = await dependencyRow(page, fake('router')).getAttribute('data-decided-at')
  expect(before).toBeTruthy()

  await garbled.getByRole('button', { name: 'Retry' }).click()

  // The fake judge never makes sense for this package, so the retry fails
  // again; what shows it ran is the verdict's new time.
  await expect(garbled).not.toHaveAttribute('data-decided-at', before ?? '', { timeout: 20_000 })
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 20_000 })
  await expect(garbled).toHaveAttribute('data-state', 'failed')
  await expect(garbled.getByRole('button', { name: 'Retry' })).toBeEnabled()
  // Nothing else was judged again.
  expect(await dependencyRow(page, fake('router')).getAttribute('data-decided-at')).toBe(routerBefore)
  await expect(dependencyRow(page, fake('colors'))).toHaveAttribute('data-state', 'not-read')

  // Only a failed verdict can be retried.
  expect(await callAction(page, 'retry-verdict', { projectId, packageName: fake('router') })).toMatchObject({
    success: false,
    error: 'Only a failed verdict can be retried.',
  })
  expect(await callAction(page, 'retry-verdict', { projectId, packageName: fake('colors') })).toMatchObject({
    success: false,
    error: 'Only a failed verdict can be retried.',
  })
})

test('scan progress is shown live while the first scan runs', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, `${FAKE_OWNER}/slow`)
  const page = alice.page
  await page.goto(`/projects/${projectId}`)

  const progress = page.getByTestId('scan-progress')
  await expect(progress).toBeVisible({ timeout: 15_000 })
  await expect(progress).toContainText(/Reading the @bumpcheck-fake\/slow-[abc] changelog/, { timeout: 15_000 })
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'scanning')
  await expect(page.getByTestId('report-waiting')).toBeVisible()
  await captureWhole(page, 'project-mid-scan.png')

  // It moves on without a reload, and ends with the report.
  await expect(progress).toContainText(/slow-c/, { timeout: 15_000 })
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 20_000 })
  await expect(progress).toHaveCount(0)
  await expect(page.getByTestId('dependency-row')).toHaveCount(3)
})

test('a project with no dependencies shows an empty state, not an empty page', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, `${FAKE_OWNER}/empty`)
  await alice.page.goto(`/projects/${projectId}`)

  await expect(alice.page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(alice.page.getByTestId('report-empty')).toContainText('No dependencies')
  await expect(alice.page.getByTestId('dependency-row')).toHaveCount(0)
})

test('opening a project records that it was opened', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  const projectId = await addProject(alice.page, `${FAKE_OWNER}/second`)

  // The page itself sends it, once the project has loaded.
  const sent = alice.page.waitForResponse((response) => response.url().endsWith('/api/actions/record-opened'))
  await alice.page.goto(`/projects/${projectId}`)
  const response = await sent
  expect(response.request().postDataJSON()).toEqual({ projectId })
  const answer = (await response.json()) as { success: boolean; data?: { lastOpenedAt?: string } }
  expect(answer.success).toBe(true)

  // The action stores the server's time, and a later call moves it forward.
  const first = Date.parse(String(answer.data?.lastOpenedAt))
  expect(Math.abs(Date.now() - first)).toBeLessThan(60_000)
  await alice.page.waitForTimeout(20)
  const again = await callAction(alice.page, 'record-opened', { projectId })
  expect(Date.parse(String(again.data?.lastOpenedAt))).toBeGreaterThan(first)
})
