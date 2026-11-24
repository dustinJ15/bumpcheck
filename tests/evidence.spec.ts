/**
 * The five screens, captured for a ticket's evidence, and checked for one
 * thing on the way: at a 390-pixel-wide window no screen scrolls sideways.
 *
 * Not part of `npm run gate`; run it by hand when the look changes:
 *
 *   BUMPCHECK_EVIDENCE=specs/bumpcheck/evidence/07 npx deepspace test run tests/evidence.spec.ts
 *
 * Signed-in screens are captured by the browser test itself (signed in as
 * Alice), because `npx deepspace test screenshot` cannot sign in. Signed-out
 * screens (landing, public view) are taken with `npx deepspace test
 * screenshot` as well. Without BUMPCHECK_EVIDENCE the captures go to
 * test-results/captures/ only.
 *
 * Ends by emptying Alice's projects, like the other specs.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'
import { EXAMPLE_PROJECT_ID } from '../src/config'
import { FAKE_OWNER } from '../src/services/fake-world'
import { addProject, callAction, capturePath, openProjects, resetProjects } from './helpers/app'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 1, `Needs the Alice test account, found ${usableTestAccounts}.`)
test.setTimeout(120_000)

const DEMO = `${FAKE_OWNER}/demo`
const WIDE = { width: 1280, height: 800 }
const NARROW = { width: 390, height: 844 }

/** Saves a full-page capture under test-results/captures/, and under BUMPCHECK_EVIDENCE when it is set. */
async function save(page: Page, name: string) {
  await page.screenshot({ path: capturePath(name), fullPage: true })
  const dir = process.env.BUMPCHECK_EVIDENCE
  if (dir) {
    mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: join(dir, name), fullPage: true })
  }
}

/** The same page taken with `npx deepspace test screenshot` (signed out), only when BUMPCHECK_EVIDENCE is set. */
function cliScreenshot(page: Page, path: string, name: string, viewport: string) {
  const dir = process.env.BUMPCHECK_EVIDENCE
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  const url = new URL(path, page.url()).toString()
  execFileSync(
    'npx',
    ['deepspace', 'test', 'screenshot', url, join(dir, name), '--full-page', `--viewport=${viewport}`, '--wait-for-timeout=4000'],
    { stdio: 'inherit' },
  )
}

async function expectNoSidewaysScroll(page: Page, screen: string) {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.documentElement
    return Math.max(main.scrollWidth - main.clientWidth, document.documentElement.scrollWidth - window.innerWidth)
  })
  expect(overflow, `${screen}: pixels of sideways overflow at 390 px`).toBeLessThanOrEqual(0)
}

/**
 * The app's pages scroll inside <main>, not the document, so a "full page"
 * capture would stop at the window's height. Grow the window to the
 * content's height for the capture, then put it back.
 */
async function saveWhole(page: Page, name: string, size: { width: number; height: number }) {
  const height = await page.evaluate(() => {
    const main = document.querySelector('main')
    const inMain = main ? main.getBoundingClientRect().top + main.scrollHeight : 0
    return Math.ceil(Math.max(inMain, document.documentElement.scrollHeight))
  })
  await page.setViewportSize({ width: size.width, height: Math.max(size.height, height) })
  await page.waitForTimeout(200)
  await save(page, name)
  await page.setViewportSize(size)
}

/** Captures the page as it is, wide and then narrow, checking the narrow one for sideways scroll. */
async function both(page: Page, screen: string) {
  await page.setViewportSize(WIDE)
  await page.waitForTimeout(300)
  await saveWhole(page, `${screen}.png`, WIDE)
  await page.setViewportSize(NARROW)
  await page.waitForTimeout(300)
  await expectNoSidewaysScroll(page, screen)
  await saveWhole(page, `${screen}-390.png`, NARROW)
  await page.setViewportSize(WIDE)
}

test('the five screens, wide and at 390 px, with an empty state and an error state', async ({ users, page: visitor }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await resetProjects(page)

  // Projects list, empty state.
  await openProjects(page)
  await expect(page.getByTestId('projects-empty')).toBeVisible({ timeout: 15_000 })
  await both(page, 'projects-empty')

  // Project page: the demo repo, scanned.
  const projectId = await addProject(page, DEMO)
  await page.goto(`/projects/${projectId}`)
  await expect(page.getByTestId('project-page')).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(page.locator('[data-testid="dependency-row"][data-state="breaking"]').first()).toBeVisible({ timeout: 15_000 })
  await both(page, 'project-page')

  // Error state: a repo whose scan fails (its changelog request fails twice).
  const failedId = await addProject(page, `${FAKE_OWNER}/outage`)
  await page.goto(`/projects/${failedId}`)
  await expect(page.getByTestId('notice-scan-failed')).toBeVisible({ timeout: 45_000 })
  await both(page, 'project-scan-failed')

  // Projects list with the two projects.
  await openProjects(page)
  await expect(page.getByTestId('project-row')).toHaveCount(2, { timeout: 15_000 })
  await expect(page.locator(`[data-testid="project-row"][data-repo="${DEMO}"]`)).toHaveAttribute('data-breaking-count', /\d/, { timeout: 15_000 })
  await both(page, 'projects')

  // Error state on the add form: a repository that does not exist.
  await page.getByLabel('Add a project').fill(`${FAKE_OWNER}/no-such-repo`)
  await page.getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByTestId('add-project-error')).toBeVisible({ timeout: 15_000 })
  await both(page, 'projects-add-error')

  // Project settings, made public so the shareable link shows.
  const shared = await callAction(page, 'set-visibility', { projectId, visibility: 'public' })
  expect(shared.success, shared.error).toBe(true)
  await page.goto(`/projects/${projectId}/settings`)
  await expect(page.getByTestId('share-link')).toBeVisible({ timeout: 15_000 })
  await both(page, 'project-settings')

  // Public view, signed out.
  await visitor.goto(`/share/${projectId}`)
  await expect(visitor.getByTestId('public-report')).toBeVisible({ timeout: 15_000 })
  await expect(visitor.locator('[data-testid="dependency-row"][data-state="breaking"]').first()).toBeVisible({ timeout: 15_000 })
  await both(visitor, 'public-view')
  cliScreenshot(visitor, `/share/${projectId}`, 'public-view-cli.png', '1280x800')
  cliScreenshot(visitor, `/share/${projectId}`, 'public-view-cli-390.png', '390x844')

  // Public view of a link that shows nothing (signed out).
  await visitor.goto(`/share/${EXAMPLE_PROJECT_ID}-missing`)
  await expect(visitor.getByTestId('public-report-not-available')).toBeVisible({ timeout: 15_000 })
  await both(visitor, 'public-view-not-available')

  // Landing, signed out.
  await visitor.goto('/')
  await expect(visitor.getByTestId('static-landing')).toBeVisible({ timeout: 15_000 })
  await both(visitor, 'landing')
  cliScreenshot(visitor, '/', 'landing-cli.png', '1280x800')
  cliScreenshot(visitor, '/', 'landing-cli-390.png', '390x844')

  // A signed-in page reached while signed out.
  await visitor.goto('/projects')
  await expect(visitor.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible({ timeout: 15_000 })
  await both(visitor, 'signed-out-wall')
  cliScreenshot(visitor, '/projects', 'signed-out-wall-cli.png', '1280x800')

  await resetProjects(page)
})
