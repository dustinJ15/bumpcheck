/**
 * THE LIVE CHECK. PAID. `npm run live-check`. See playwright.live.config.ts.
 *
 * Runs one real scan of the fixed example repo, end to end, through the real
 * app: signs in as the Alice test account, adds the repo with the real
 * add-project action, waits for the real scan job, then prints what the scan
 * found and what the account spent.
 *
 * Expected cost: a few cents. Up to 4 GitHub calls to check and read the
 * repo, one GitHub call per changelog, and at most
 * `LIMITS.newVerdictsPerScan` Claude calls (fewer on a second run, because
 * verdicts are cached).
 *
 * Before running: run `npm run gate` once in the same checkout, so the
 * platform CLI has written fresh local settings for the dev server. Nothing
 * else may be using the port.
 *
 * If the repo is already one of Alice's projects from an earlier live check,
 * this stops with a message instead of spending anything. From ticket 06 on
 * the project can be deleted on its settings page.
 */

import { execFileSync } from 'node:child_process'
import { test, expect } from 'deepspace/testing'
import type { Page } from '@playwright/test'

const EXAMPLE_REPO = 'dustinJ15/bumpcheck-example'
const EXAMPLE_REPO_STORED = EXAMPLE_REPO.toLowerCase()

interface AccountUsage {
  credits?: { totalUsed?: number; credits?: number }
  usageByIntegration?: unknown[]
}

/** The account's credit usage, from the platform CLI. Reads no local file. */
function accountUsage(): AccountUsage {
  const out = execFileSync('npx', ['deepspace', 'app', 'usage', '--json'], { encoding: 'utf8' })
  return JSON.parse(out.trim().split('\n').pop() ?? '{}') as AccountUsage
}

async function authToken(page: Page): Promise<string> {
  const response = await page.request.post('/api/auth/token', { headers: { 'Content-Type': 'application/json' } })
  const body = (await response.json()) as { token?: string }
  if (!body.token) throw new Error('could not get an auth token for the test account')
  return body.token
}

test('live check: one real scan of the example repo', async ({ users }) => {
  const before = accountUsage()
  console.log(`\n[live-check] credits used before: ${before.credits?.totalUsed}`)

  const [alice] = await users(['Alice'])
  const page = alice.page
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible({ timeout: 30_000 })

  const row = page.locator(`[data-testid="project-row"][data-repo="${EXAMPLE_REPO_STORED}"]`)
  await page.waitForTimeout(3000)
  if ((await row.count()) > 0) {
    throw new Error(
      `[live-check] ${EXAMPLE_REPO} is already one of the test account's projects, so there is no first scan to run. Nothing was spent.`,
    )
  }

  // The real add-project action: checks the repo on GitHub, creates the
  // project, enqueues the first scan.
  const response = await page.request.post('/api/actions/add-project', {
    headers: { Authorization: `Bearer ${await authToken(page)}` },
    data: { repo: EXAMPLE_REPO },
  })
  const added = (await response.json()) as { success: boolean; error?: string }
  console.log(`[live-check] add-project: ${JSON.stringify(added)}`)
  expect(added.success, added.error).toBe(true)

  // The real scan job. Wait for it to end either way, then report.
  await expect(row).toHaveAttribute('data-scan-status', /^(done|failed)$/, { timeout: 4 * 60_000 })
  const status = await row.getAttribute('data-scan-status')
  console.log(`[live-check] scan status: ${status}`)
  console.log(`[live-check] row text: ${(await row.innerText()).replace(/\s+/g, ' ')}`)

  // -------------------------------------------------------------------
  // TICKET 06: send the one real test email here, after the scan, and
  // print its outcome. (Call the send-test-email action for this project.)
  // -------------------------------------------------------------------

  // Usage can take a moment to be recorded.
  await page.waitForTimeout(15_000)
  const after = accountUsage()
  const spent = (after.credits?.totalUsed ?? 0) - (before.credits?.totalUsed ?? 0)
  console.log(`[live-check] credits used after: ${after.credits?.totalUsed}`)
  console.log(`[live-check] SPENT BY THIS RUN: ${spent} credits (100 credits = US$1)`)
  console.log(`[live-check] usage by integration: ${JSON.stringify(after.usageByIntegration)}`)
  console.log('[live-check] if "spent" is 0, usage may not be recorded yet: run `npx deepspace app usage` again in a minute.')

  expect(status, 'the real scan should finish').toBe('done')
})
