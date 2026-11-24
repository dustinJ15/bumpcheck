/**
 * The unsubscribe route's logic, against an in-memory stand-in for the
 * record tools and a throwaway signing key. The stand-in records every
 * write, so a test can say "nothing was changed".
 */

import { describe, expect, it } from 'vitest'
import { signUnsubscribeToken } from '../core/unsubscribe-token'
import { handleUnsubscribe, type UnsubscribeTools } from './unsubscribe'

/** Made up for these tests. The real key is never read by a test. */
const KEY = 'throwaway-test-key-not-a-secret'

interface Write {
  collection: string
  recordId: string
  data: Record<string, unknown>
}

function world(projects: Record<string, Record<string, unknown>>) {
  const rows = new Map(Object.entries(projects))
  const writes: Write[] = []
  const reads: string[] = []
  const failing = new Set<'get' | 'update'>()
  const tools: UnsubscribeTools = {
    async get(collection, recordId) {
      reads.push(`${collection}/${recordId}`)
      if (failing.has('get')) return { success: false, error: 'the record room is down' } as never
      const data = collection === 'projects' ? rows.get(recordId) : undefined
      if (!data) return { success: false, error: `Record not found: ${collection}/${recordId}` }
      return { success: true, data: { record: { recordId, data, createdBy: 'app-owner', createdAt: '', updatedAt: '' } } } as never
    },
    async update(collection, recordId, data) {
      if (failing.has('update')) return { success: false, error: 'the record room is down' } as never
      writes.push({ collection, recordId, data: { ...data } })
      const existing = rows.get(recordId)
      if (!existing) return { success: false, error: `records.update: no record "${recordId}" in ${collection}` } as never
      rows.set(recordId, { ...existing, ...data })
      return { success: true, data: { recordId } } as never
    },
  }
  return { tools, rows, writes, reads, failing }
}

const shop = (alertsEnabled: unknown = 1) => ({
  userId: 'user-alice-123',
  visibility: 'private',
  repoOwner: 'acme',
  repoName: 'shop',
  alertsEnabled,
  alertedKeys: ['express@4->5.1'],
  reviewedKeys: [],
})

/** Calls the route's logic with the test key, or with the key given (which may be `undefined`: no key at all). */
async function call(w: ReturnType<typeof world>, method: 'GET' | 'POST', token: unknown, ...key: [] | [string | undefined]) {
  return handleUnsubscribe({ method, token, signingKey: key.length === 0 ? KEY : key[0], tools: w.tools })
}

describe('unsubscribe: opening the link (GET)', () => {
  it('shows a confirmation page with one button, and changes nothing', async () => {
    const w = world({ p1: shop() })
    const token = await signUnsubscribeToken('p1', KEY)
    const reply = await call(w, 'GET', token)

    expect(reply.status).toBe(200)
    expect(reply.html).toContain('Stop alert emails for acme/shop?')
    expect(reply.html.match(/<button/g)).toHaveLength(1)
    expect(reply.html).toContain('<form method="post"')
    expect(reply.html).toContain(`action="/api/unsubscribe?token=${token}"`)
    // A mail scanner that fetches the link must not unsubscribe anyone.
    expect(w.writes).toEqual([])
    expect(w.rows.get('p1')?.alertsEnabled).toBe(1)
  })

  it('says so when alerts are already off, and offers no button', async () => {
    const w = world({ p1: shop(0) })
    const reply = await call(w, 'GET', await signUnsubscribeToken('p1', KEY))
    expect(reply.status).toBe(200)
    expect(reply.html).toContain('Alert emails for acme/shop are already off.')
    expect(reply.html).not.toContain('<button')
    expect(w.writes).toEqual([])
  })
})

describe('unsubscribe: the one click (POST)', () => {
  it('turns alerts off for the project the token names', async () => {
    const w = world({ p1: shop() })
    const reply = await call(w, 'POST', await signUnsubscribeToken('p1', KEY))

    expect(reply.status).toBe(200)
    expect(reply.html).toContain('Alert emails for acme/shop are off.')
    expect(w.rows.get('p1')?.alertsEnabled).toBe(false)
  })

  it('can do nothing else: its only write is the alert setting of that one project', async () => {
    const w = world({ p1: shop(), p2: shop() })
    await call(w, 'POST', await signUnsubscribeToken('p1', KEY))

    expect(w.writes).toEqual([{ collection: 'projects', recordId: 'p1', data: { alertsEnabled: false } }])
    expect(w.rows.get('p2')?.alertsEnabled).toBe(1)
    // Everything else on the row is as it was.
    expect(w.rows.get('p1')).toEqual({ ...shop(), alertsEnabled: false })
  })

  it('works again on a project whose alerts are already off', async () => {
    const w = world({ p1: shop(0) })
    const reply = await call(w, 'POST', await signUnsubscribeToken('p1', KEY))
    expect(reply.status).toBe(200)
    expect(reply.html).toContain('Alert emails for acme/shop are off.')
  })

  it('a link for a project that was deleted still ends well: there is nothing left to send', async () => {
    const w = world({})
    for (const method of ['GET', 'POST'] as const) {
      const reply = await call(w, method, await signUnsubscribeToken('gone', KEY))
      expect(reply.status).toBe(200)
      expect(reply.html).toContain('Alert emails for this project are off.')
    }
    expect(w.writes).toEqual([])
  })
})

describe('unsubscribe: a bad link', () => {
  it('a tampered token gets a plain error page and changes nothing', async () => {
    const w = world({ p1: shop(), p2: shop() })
    const token = await signUnsubscribeToken('p1', KEY)
    const [id, signature] = token.split('.')
    const flipped = signature.startsWith('A') ? `B${signature.slice(1)}` : `A${signature.slice(1)}`

    for (const method of ['GET', 'POST'] as const) {
      const reply = await call(w, method, `${id}.${flipped}`)
      expect(reply.status).toBe(400)
      expect(reply.html).toContain('This unsubscribe link is not valid')
      expect(reply.html).not.toContain('<button')
    }
    expect(w.writes).toEqual([])
    // It does not even look the project up.
    expect(w.reads).toEqual([])
  })

  it('a token for another project: one project\'s signature cannot turn off another\'s alerts', async () => {
    const w = world({ p1: shop(), p2: shop() })
    const mine = await signUnsubscribeToken('p1', KEY)
    const theirs = await signUnsubscribeToken('p2', KEY)
    const forged = `${theirs.split('.')[0]}.${mine.split('.')[1]}`

    const reply = await call(w, 'POST', forged)
    expect(reply.status).toBe(400)
    expect(w.writes).toEqual([])
    expect(w.rows.get('p2')?.alertsEnabled).toBe(1)
  })

  it('a missing token, or anything that is not one, gets the same error page', async () => {
    const w = world({ p1: shop() })
    for (const token of [undefined, '', 'p1', 'p1.', '.x', 'a.b.c', 42]) {
      const reply = await call(w, 'POST', token)
      expect(reply.status, String(token)).toBe(400)
    }
    expect(w.writes).toEqual([])
  })

  it('a token signed with another key is refused', async () => {
    const w = world({ p1: shop() })
    const reply = await call(w, 'POST', await signUnsubscribeToken('p1', 'some-other-throwaway-key'))
    expect(reply.status).toBe(400)
    expect(w.writes).toEqual([])
  })
})

describe('unsubscribe: fails closed', () => {
  it('without the signing key nothing verifies and nothing is changed, even for a genuine token', async () => {
    const w = world({ p1: shop() })
    const token = await signUnsubscribeToken('p1', KEY)
    for (const missing of [undefined, '']) {
      for (const method of ['GET', 'POST'] as const) {
        const reply = await call(w, method, token, missing)
        expect(reply.status).toBe(503)
        expect(reply.html).toContain('This link cannot be checked right now')
        expect(reply.html).not.toContain('<button')
      }
    }
    expect(w.writes).toEqual([])
    expect(w.reads).toEqual([])
    expect(w.rows.get('p1')?.alertsEnabled).toBe(1)
  })

  it('without the signing key, an unsigned or empty-key token does not get through either', async () => {
    const w = world({ p1: shop() })
    const id = (await signUnsubscribeToken('p1', KEY)).split('.')[0]
    for (const token of [id, `${id}.`, `${id}.AAAA`]) {
      expect((await call(w, 'POST', token, '')).status).toBe(503)
    }
    expect(w.writes).toEqual([])
  })

  it('says it did not work when the project cannot be read or written, and never claims alerts are off', async () => {
    const token = await signUnsubscribeToken('p1', KEY)
    for (const broken of ['get', 'update'] as const) {
      const w = world({ p1: shop() })
      w.failing.add(broken)
      const reply = await call(w, 'POST', token)
      expect(reply.status).toBe(500)
      expect(reply.html).toContain('Nothing was changed')
      expect(reply.html).not.toContain('are off')
      expect(w.rows.get('p1')?.alertsEnabled).toBe(1)
    }
  })
})

describe('unsubscribe: what the pages give away', () => {
  it('never contains the signing key, the owner\'s id, or anything but the repo name from the project', async () => {
    const w = world({ p1: shop() })
    const token = await signUnsubscribeToken('p1', KEY)
    for (const method of ['GET', 'POST'] as const) {
      const { html } = await call(w, method, token)
      expect(html).not.toContain(KEY)
      expect(html).not.toContain('user-alice-123')
      expect(html).not.toContain('express@4->5.1')
    }
  })

  it('escapes the repo name and the token it puts in the page', async () => {
    const w = world({ p1: { ...shop(), repoOwner: '<script>alert(1)</script>', repoName: 'a"b' } })
    const token = await signUnsubscribeToken('p1', KEY)
    const { html } = await call(w, 'GET', token)
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;/a&quot;b')
  })

  it('loads nothing from anywhere and asks not to be indexed', async () => {
    const w = world({ p1: shop() })
    const { html } = await call(w, 'GET', await signUnsubscribeToken('p1', KEY))
    expect(html).not.toMatch(/<script|<img|<link|@import|url\(/i)
    expect(html).toContain('<meta name="robots" content="noindex">')
  })
})
