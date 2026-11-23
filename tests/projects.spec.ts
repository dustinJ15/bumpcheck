/**
 * Signed-in flows for the add-project ticket, against fake services.
 *
 * The test server is started with the fake-services setting (see
 * playwright.config.ts), so nothing here reaches GitHub, npm or Claude: repos
 * and packages come from src/services/fake-world.ts. Records are real: they
 * live in the local record room, which keeps its data between runs, so each
 * test first empties the signed-in test account's project list.
 *
 * Accounts: Alice and Bob, the two test accounts that already exist on this
 * machine. Both are ordinary members, not the app owner.
 */

import { readFileSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'
import { LIMITS } from '../src/config'
import { FAKE_OWNER } from '../src/services/fake-world'
import { authToken, callAction, capture, openProjects, projectRow, resetProjects } from './helpers/app'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs the 2 test accounts (Alice and Bob), found ${usableTestAccounts}.`)

// The tests share one account's project list, so they must not interleave.
test.describe.configure({ mode: 'serial' })

const DEMO = `${FAKE_OWNER}/demo`
const APP_ID = /DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/.exec(readFileSync('wrangler.toml', 'utf8'))?.[1]
const JOB_ROOM = `app:${APP_ID}`

// ---------------------------------------------------------------- helpers

async function addThroughForm(page: Page, repo: string) {
  await page.getByLabel('Add a project').fill(repo)
  await page.getByRole('button', { name: 'Add project' }).click()
}

/**
 * Opens the job room's WebSocket from the page, sends one message, and
 * returns everything the room said in the next moments.
 */
async function talkToJobRoom(page: Page, token: string | null, message: unknown): Promise<string[]> {
  return page.evaluate(
    async ({ room, token, message }) => {
      const url = new URL(`/ws/jobs/${encodeURIComponent(room)}`, window.location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      if (token) url.searchParams.set('token', token)
      const received: string[] = []
      const socket = new WebSocket(url)
      socket.onmessage = (event) => received.push(String(event.data))
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve()
        socket.onerror = () => reject(new Error('job room socket failed to open'))
      })
      // Let the room send its greeting (auth + snapshot), then try to enqueue.
      await new Promise((resolve) => setTimeout(resolve, 1000))
      socket.send(JSON.stringify(message))
      await new Promise((resolve) => setTimeout(resolve, 1500))
      socket.close()
      return received
    },
    { room: JOB_ROOM, token, message },
  )
}

const ENQUEUE_SCAN = {
  type: 'job.enqueue',
  payload: { requestId: 'test-request', type: 'scan', payload: { projectId: 'not-a-project', onDemand: false } },
}

// ------------------------------------------------------------------ tests

test('the projects list starts empty, a project is added, and its first scan finishes while watching', async ({
  users,
}) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  await openProjects(alice.page)

  await expect(alice.page.getByTestId('projects-empty')).toBeVisible()
  await capture(alice.page, 'projects-empty.png')

  // A GitHub URL, in mixed case: both forms of input in one go.
  await addThroughForm(alice.page, `https://github.com/Bumpcheck-Fake/Demo`)

  // The row appears on its own (no reload): the list is a live query.
  const row = projectRow(alice.page, DEMO)
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(alice.page.getByTestId('projects-empty')).toHaveCount(0)
  await expect(alice.page.getByTestId('add-project-error')).toHaveCount(0)
  await expect(alice.page.getByLabel('Add a project')).toHaveValue('')

  // The first scan was enqueued by the server action and runs as a
  // background job. Its status reaches the page through the project row.
  await expect(row).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })
  await expect(row.getByTestId('project-scan-status')).toContainText('Scanned')
  await expect(row).toContainText('10 dependencies')
  await capture(alice.page, 'projects-with-project.png')

  // It is still there after a reload: it was written by the server, not held in the page.
  await alice.page.reload()
  await expect(projectRow(alice.page, DEMO)).toHaveAttribute('data-scan-status', 'done', { timeout: 15_000 })
})

test('adding the same repo twice is refused with its own message', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  expect((await callAction(alice.page, 'add-project', { repo: DEMO })).success).toBe(true)

  await openProjects(alice.page)
  await expect(projectRow(alice.page, DEMO)).toBeVisible({ timeout: 15_000 })

  // Same repo, different letter case and form.
  await addThroughForm(alice.page, 'BUMPCHECK-FAKE/Demo')
  await expect(alice.page.getByTestId('add-project-error')).toHaveText(`You have already added ${DEMO}.`)
  await expect(alice.page.getByTestId('project-row')).toHaveCount(1)
})

test('the project limit is reported, and nothing is added past it', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)

  const repos = ['demo', 'second', 'third', 'fourth'].map((name) => `${FAKE_OWNER}/${name}`)
  expect(repos.length).toBeGreaterThan(LIMITS.projectsPerUser)
  for (const repo of repos.slice(0, LIMITS.projectsPerUser)) {
    const added = await callAction(alice.page, 'add-project', { repo })
    expect(added.success, added.error).toBe(true)
  }

  await openProjects(alice.page)
  await expect(alice.page.getByTestId('project-row')).toHaveCount(LIMITS.projectsPerUser, { timeout: 15_000 })

  await addThroughForm(alice.page, repos[LIMITS.projectsPerUser])
  await expect(alice.page.getByTestId('add-project-error')).toHaveText(
    `You have reached the limit of ${LIMITS.projectsPerUser} projects. Delete one to add another.`,
  )
  await expect(alice.page.getByTestId('project-row')).toHaveCount(LIMITS.projectsPerUser)
})

test('add requests sent at the same moment cannot get past the project limit', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)

  const repos = ['demo', 'second', 'third', 'fourth'].map((name) => `${FAKE_OWNER}/${name}`)
  expect(repos.length).toBeGreaterThan(LIMITS.projectsPerUser)
  const answers = await Promise.all(repos.map((repo) => callAction(alice.page, 'add-project', { repo })))
  // At least one of them must have been refused.
  expect(answers.filter((answer) => answer.success).length).toBeLessThanOrEqual(LIMITS.projectsPerUser)

  await openProjects(alice.page)
  await expect(alice.page.getByRole('button', { name: 'Add project' })).toBeVisible()
  await alice.page.waitForTimeout(1500)
  expect(await alice.page.getByTestId('project-row').count()).toBeLessThanOrEqual(LIMITS.projectsPerUser)
})

test('a repo that cannot be scanned is refused with the reason, inline', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await resetProjects(alice.page)
  await openProjects(alice.page)
  const error = alice.page.getByTestId('add-project-error')

  await addThroughForm(alice.page, 'not a repo')
  await expect(error).toHaveText('Enter a public GitHub repository as owner/repo or a github.com URL.')

  await addThroughForm(alice.page, `${FAKE_OWNER}/does-not-exist`)
  await expect(error).toHaveText('The repository was not found or is not public.')

  await addThroughForm(alice.page, `${FAKE_OWNER}/no-manifest`)
  await expect(error).toHaveText('The repository has no package.json at its root.')

  await addThroughForm(alice.page, `${FAKE_OWNER}/bad-json`)
  await expect(error).toHaveText('package.json is not valid JSON.')

  await expect(alice.page.getByTestId('project-row')).toHaveCount(0)
  await expect(alice.page.getByTestId('projects-empty')).toBeVisible()
})

test("one user's projects are not in another user's list", async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  await resetProjects(alice.page)
  await resetProjects(bob.page)
  expect((await callAction(alice.page, 'add-project', { repo: DEMO })).success).toBe(true)

  await openProjects(bob.page)
  await expect(bob.page.getByTestId('projects-empty')).toBeVisible({ timeout: 15_000 })

  // Different users may add the same repo (ledger item 23).
  await addThroughForm(bob.page, DEMO)
  await expect(projectRow(bob.page, DEMO)).toBeVisible({ timeout: 15_000 })
  await expect(bob.page.getByTestId('add-project-error')).toHaveCount(0)
})

test('an action needs a verified sign-in: no token, no project', async ({ request }) => {
  const noToken = await request.post('/api/actions/add-project', { data: { repo: DEMO } })
  expect(noToken.status()).toBe(401)

  const badToken = await request.post('/api/actions/add-project', {
    headers: { Authorization: 'Bearer not-a-real-token' },
    data: { repo: DEMO, userId: 'someone-else' },
  })
  expect(badToken.status()).toBe(401)
})

test.describe('the job room is locked down', () => {
  test('a member cannot enqueue a job, and cannot read the queue', async ({ users }) => {
    const [alice] = await users(['Alice'])
    await resetProjects(alice.page)
    // Put a real job in the room first, so "the member sees no jobs" means something.
    expect((await callAction(alice.page, 'add-project', { repo: DEMO })).success).toBe(true)
    await openProjects(alice.page)
    await expect(projectRow(alice.page, DEMO)).toHaveAttribute('data-scan-status', 'done', { timeout: 30_000 })

    const received = await talkToJobRoom(alice.page, await authToken(alice.page), ENQUEUE_SCAN)
    const messages = received.map((text) => JSON.parse(text) as { type: string; payload?: Record<string, unknown> })

    // The room's greeting: no write access, and an empty snapshot.
    expect(messages[0]).toEqual({ type: 'auth', payload: { canWrite: false } })
    const snapshots = messages.filter((m) => m.type === 'job.update' && m.payload?.kind === 'snapshot')
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].payload?.jobs).toEqual([])

    // The enqueue is refused, and no job was created or announced.
    expect(received.join('\n')).toContain('Write access denied')
    expect(messages.filter((m) => m.type === 'job.update' && m.payload?.kind !== 'snapshot')).toEqual([])
    expect(received.join('\n')).not.toContain('not-a-project')
  })

  test('a signed-out visitor cannot enqueue a job either', async ({ page }) => {
    await page.goto('/projects')
    const received = await talkToJobRoom(page, null, ENQUEUE_SCAN)
    const messages = received.map((text) => JSON.parse(text) as { type: string; payload?: Record<string, unknown> })

    expect(messages[0]).toEqual({ type: 'auth', payload: { canWrite: false } })
    expect(received.join('\n')).toContain('Write access denied')
    expect(messages.filter((m) => m.type === 'job.update' && m.payload?.kind !== 'snapshot')).toEqual([])
  })
})

test('a signed-in member cannot call an owner-billed integration from the browser', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await alice.page.goto('/projects')
  // The endpoint name does not exist, so even if this guard were removed the
  // request could not reach a paid call. The worker must refuse it first.
  const response = await alice.page.request.post('/api/integrations/github/bumpcheck-test-no-such-endpoint', {
    headers: { Authorization: `Bearer ${await authToken(alice.page)}` },
    data: {},
  })
  expect(response.status()).toBe(403)
})
