/**
 * Helpers shared by the signed-in browser specs.
 *
 * The test server runs against fake services (playwright.config.ts), but its
 * records are real: the local record room keeps projects, verdicts and the
 * daily AI-call count between runs. `resetProjects` puts all three back to
 * empty through two test-only actions (src/actions/test-reset.ts).
 */

import { expect } from 'deepspace/testing'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

const APP_ID = /DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/.exec(readFileSync('wrangler.toml', 'utf8'))?.[1]
/** The app's record room, as the pages name it when they connect. */
export const RECORD_ROOM = `app:${APP_ID}`

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

export interface WireRecord {
  recordId: string
  createdBy: string
  data: Record<string, unknown>
}

/**
 * Asks the record room directly, as this page's user (or as a signed-out
 * visitor when `token` is null), for every row of a collection it will
 * give. This is the server's answer, with no page code in between.
 */
export async function askRecordRoom(page: Page, token: string | null, collection: string): Promise<{ records: WireRecord[]; raw: string }> {
  const received = await page.evaluate(
    async ({ room, token, collection }) => {
      const url = new URL(`/ws/${encodeURIComponent(room)}`, window.location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      if (token) url.searchParams.set('token', token)
      const received: string[] = []
      const socket = new WebSocket(url)
      socket.onmessage = (event) => received.push(String(event.data))
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve()
        socket.onerror = () => reject(new Error('record room socket failed to open'))
      })
      await new Promise((resolve) => setTimeout(resolve, 500))
      socket.send(JSON.stringify({ type: 'core.subscribe', payload: { subscriptionId: 'test-probe', query: { collection } } }))
      await new Promise((resolve) => setTimeout(resolve, 1500))
      socket.close()
      return received
    },
    { room: RECORD_ROOM, token, collection },
  )
  const answers = received
    .map((text) => JSON.parse(text) as { type: string; payload?: { subscriptionId?: string; records?: WireRecord[] } })
    .filter((message) => message.type === 'core.query_result' && message.payload?.subscriptionId === 'test-probe')
  // The room must have answered, or "it sent no rows" would mean nothing.
  expect(answers, `the record room answered the ${collection} query`).toHaveLength(1)
  return { records: answers[0].payload?.records ?? [], raw: received.join('\n') }
}

export interface RosterEntry {
  id: string
  name?: string
  email?: string
}

/**
 * Asks the record room for its user roster (`user.list`), as this page's
 * user or as a signed-out visitor when `token` is null. Returns the roster
 * from the room's answer to that request, and everything the socket
 * received, including any roster the room sent unasked when it connected.
 */
export async function askUserList(page: Page, token: string | null): Promise<{ users: RosterEntry[]; raw: string }> {
  const received = await page.evaluate(
    async ({ room, token }) => {
      const url = new URL(`/ws/${encodeURIComponent(room)}`, window.location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      if (token) url.searchParams.set('token', token)
      const received: string[] = []
      const socket = new WebSocket(url)
      socket.onmessage = (event) => received.push(String(event.data))
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve()
        socket.onerror = () => reject(new Error('record room socket failed to open'))
      })
      await new Promise((resolve) => setTimeout(resolve, 500))
      const before = received.length
      socket.send(JSON.stringify({ type: 'user.list', payload: {} }))
      await new Promise((resolve) => setTimeout(resolve, 1500))
      socket.close()
      return { all: received, answer: received.slice(before) }
    },
    { room: RECORD_ROOM, token },
  )
  const answers = received.answer
    .map((text) => JSON.parse(text) as { type: string; payload?: { users?: RosterEntry[] } })
    .filter((message) => message.type === 'user.list')
  // The room must have answered, or "it listed nobody" would mean nothing.
  expect(answers.length, 'the record room answered user.list').toBeGreaterThan(0)
  return { users: answers[answers.length - 1].payload?.users ?? [], raw: received.all.join('\n') }
}
