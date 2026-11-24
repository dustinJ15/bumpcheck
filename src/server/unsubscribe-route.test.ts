/**
 * The unsubscribe route as the worker serves it: a real Hono app with only
 * this route, a stand-in record room, and an env built here. This is where
 * "the worker passes its own signing key, and nothing else, to the check"
 * is tested; what the route then does with a token is in ./unsubscribe.test.ts.
 *
 * The key is a throwaway made up for these tests.
 */

import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppContext, Env } from '../../worker'
import { signUnsubscribeToken } from '../core/unsubscribe-token'
import { registerUnsubscribeRoute } from './http-routes'

const KEY = 'throwaway-test-key-not-a-secret'

interface ToolCall {
  tool: string
  params: { collection: string; recordId: string; data?: Record<string, unknown> }
  asUser: string | null
}

/** An env with a record room that answers `records.get` and `records.update` from memory, and records every call. */
function world(signingKey: string | undefined) {
  const projects = new Map<string, Record<string, unknown>>([
    ['p1', { userId: 'user-alice-123', repoOwner: 'acme', repoName: 'shop', alertsEnabled: 1 }],
    ['p2', { userId: 'user-bob-456', repoOwner: 'acme', repoName: 'other', alertsEnabled: 1 }],
  ])
  const calls: ToolCall[] = []
  const room = {
    async fetch(request: Request): Promise<Response> {
      const { tool, params } = (await request.json()) as Pick<ToolCall, 'tool' | 'params'>
      calls.push({ tool, params, asUser: request.headers.get('X-User-Id') })
      const row = projects.get(params.recordId)
      if (!row) return Response.json({ success: false, error: `Record not found: ${params.collection}/${params.recordId}` })
      if (tool === 'records.update') projects.set(params.recordId, { ...row, ...params.data })
      return Response.json({ success: true, data: { recordId: params.recordId, record: { recordId: params.recordId, data: row } } })
    },
  }
  const env = {
    DEEPSPACE_APP_ID: 'app_test',
    OWNER_USER_ID: 'app-owner',
    APP_OWNER_JWT: 'not-a-real-token',
    RECORD_ROOMS: { idFromName: (name: string) => name, get: () => room },
    ...(signingKey === undefined ? {} : { UNSUBSCRIBE_SIGNING_KEY: signingKey }),
  } as unknown as Env

  const app = new Hono<AppContext>()
  registerUnsubscribeRoute(app)
  const send = (method: string, token: string | null) =>
    app.request(`/api/unsubscribe${token === null ? '' : `?token=${token}`}`, { method }, env)
  return { send, calls, projects }
}

describe('the unsubscribe route', () => {
  it('GET with a genuine token answers a page and writes nothing', async () => {
    const w = world(KEY)
    const response = await w.send('GET', await signUnsubscribeToken('p1', KEY))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Stop alert emails for acme/shop?')
    expect(w.calls.map((call) => call.tool)).toEqual(['records.get'])
  })

  it('POST with a genuine token turns that one project\'s alerts off, acting as the app owner, with no sign-in', async () => {
    const w = world(KEY)
    const response = await w.send('POST', await signUnsubscribeToken('p1', KEY))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Alert emails for acme/shop are off.')
    expect(w.calls).toEqual([
      { tool: 'records.get', params: { collection: 'projects', recordId: 'p1' }, asUser: 'app-owner' },
      { tool: 'records.update', params: { collection: 'projects', recordId: 'p1', data: { alertsEnabled: false } }, asUser: 'app-owner' },
    ])
    expect(w.projects.get('p2')?.alertsEnabled).toBe(1)
  })

  it('checks the token with the worker\'s own key: a token signed with any other key is refused', async () => {
    const w = world(KEY)
    for (const otherKey of ['another-throwaway-key', 'default', 'undefined', ' ']) {
      const response = await w.send('POST', await signUnsubscribeToken('p1', otherKey))
      expect(response.status, otherKey).toBe(400)
    }
    expect(w.calls).toEqual([])
  })

  it('fails closed when the worker has no signing key: every link is refused and the records are never touched', async () => {
    for (const missing of [undefined, '']) {
      const w = world(missing)
      // Tokens someone could make without knowing any secret, plus a genuine one from another key.
      const guesses = [
        await signUnsubscribeToken('p1', KEY),
        await signUnsubscribeToken('p1', 'undefined'),
        await signUnsubscribeToken('p1', 'default'),
        `${btoa('p1')}.`,
        btoa('p1'),
      ]
      for (const token of guesses) {
        for (const method of ['GET', 'POST']) {
          const response = await w.send(method, token)
          expect(response.status).toBe(503)
          expect(await response.text()).toContain('This link cannot be checked right now')
        }
      }
      expect(w.calls).toEqual([])
      expect(w.projects.get('p1')?.alertsEnabled).toBe(1)
    }
  })

  it('a missing or made-up token is refused', async () => {
    const w = world(KEY)
    expect((await w.send('POST', null)).status).toBe(400)
    expect((await w.send('GET', 'abc.def')).status).toBe(400)
    expect(w.calls).toEqual([])
  })

  it('never puts the key in a response, and keeps the page out of caches, search results and referrers', async () => {
    const w = world(KEY)
    const token = await signUnsubscribeToken('p1', KEY)
    for (const [method, value] of [['GET', token], ['POST', token], ['POST', 'abc.def']] as const) {
      const response = await w.send(method, value)
      const everything = `${await response.text()}\n${JSON.stringify([...response.headers])}`
      expect(everything).not.toContain(KEY)
      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    }
  })

  it('answers GET and POST only', async () => {
    const w = world(KEY)
    const token = await signUnsubscribeToken('p1', KEY)
    for (const method of ['PUT', 'DELETE', 'PATCH']) expect((await w.send(method, token)).status).toBe(404)
    expect(w.calls).toEqual([])
  })
})
