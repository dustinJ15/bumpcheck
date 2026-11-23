/**
 * Helpers shared by the signed-in browser specs.
 *
 * The test server runs against fake services (playwright.config.ts), but its
 * records are real: the local record room keeps projects, verdicts and the
 * daily AI-call count between runs. `resetProjects` puts all three back to
 * empty through two test-only actions (src/actions/test-reset.ts).
 */

import { expect } from 'deepspace/testing'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

export interface ActionAnswer {
  success: boolean
  error?: string
  code?: string
  data?: Record<string, unknown>
}

/** The signed-in page's short-lived token, as the app itself fetches it. */
export async function authToken(page: Page): Promise<string> {
  const response = await page.request.post('/api/auth/token', { headers: { 'Content-Type': 'application/json' } })
  const body = (await response.json()) as { token?: string }
  if (!body.token) throw new Error('could not get an auth token for the test account')
  return body.token
}

/** Calls a server action as the page's user. */
export async function callAction(page: Page, name: string, params: Record<string, unknown> = {}): Promise<ActionAnswer> {
  const response = await page.request.post(`/api/actions/${name}`, {
    headers: { Authorization: `Bearer ${await authToken(page)}` },
    data: params,
  })
  return (await response.json()) as ActionAnswer
}

/**
 * Empties the user's project list, and the fake world's shared state: the
 * verdicts of the fake packages and today's AI-call count. Without the
 * second part a verdict cached by one test would already be there in the
 * next, and enough runs in one day would reach the daily AI ceiling.
 */
export async function resetProjects(page: Page) {
  const projects = await callAction(page, 'test-reset-my-projects')
  expect(projects.success, projects.error).toBe(true)
  const world = await callAction(page, 'test-reset-fake-world')
  expect(world.success, world.error).toBe(true)
}

/** Adds a project through the server action and returns its id. */
export async function addProject(page: Page, repo: string): Promise<string> {
  const added = await callAction(page, 'add-project', { repo })
  expect(added.success, added.error).toBe(true)
  return String(added.data?.projectId)
}

export async function openProjects(page: Page) {
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible({ timeout: 15_000 })
}

export function projectRow(page: Page, repo: string) {
  return page.locator(`[data-testid="project-row"][data-repo="${repo}"]`)
}

/**
 * Where the specs save their own captures: `test-results/captures/`, which
 * git ignores. A ticket's evidence images are copied from there.
 */
export function capturePath(name: string): string {
  return join('test-results', 'captures', name)
}

export async function capture(page: Page, name: string) {
  await page.screenshot({ path: capturePath(name), fullPage: true })
}
