/**
 * Unsubscribe tokens: sign and verify. The key here is a throwaway made up
 * for these tests; the real one lives in the app's secret store and is
 * never read by a test.
 */

import { describe, expect, it } from 'vitest'
import { signUnsubscribeToken, unsubscribeUrl, UNSUBSCRIBE_PATH, verifyUnsubscribeToken } from './unsubscribe-token'

const KEY = 'throwaway-test-key-not-a-secret'
const OTHER_KEY = 'another-throwaway-test-key'

describe('unsubscribe tokens', () => {
  it('round trip: a signed token verifies and names its project', async () => {
    const token = await signUnsubscribeToken('project-1', KEY)
    expect(await verifyUnsubscribeToken(token, KEY)).toEqual({ ok: true, projectId: 'project-1' })
  })

  it('is safe to put in a URL as it is', async () => {
    const token = await signUnsubscribeToken('project/with odd?chars&=', KEY)
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(await verifyUnsubscribeToken(token, KEY)).toEqual({ ok: true, projectId: 'project/with odd?chars&=' })
  })

  it('does not contain the key', async () => {
    const token = await signUnsubscribeToken('project-1', KEY)
    expect(token).not.toContain(KEY)
    expect(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).not.toContain(KEY)
  })

  it('tampering: changing any character of the signature is refused', async () => {
    const token = await signUnsubscribeToken('project-1', KEY)
    const [id, signature] = token.split('.')
    for (let i = 0; i < signature.length; i++) {
      const swapped = signature[i] === 'A' ? 'B' : 'A'
      const forged = `${id}.${signature.slice(0, i)}${swapped}${signature.slice(i + 1)}`
      if (forged === token) continue
      expect(await verifyUnsubscribeToken(forged, KEY), `character ${i}`).toEqual({ ok: false })
    }
  })

  it('wrong project: one project\'s signature does not unsubscribe another', async () => {
    const mine = await signUnsubscribeToken('project-1', KEY)
    const theirs = await signUnsubscribeToken('project-2', KEY)
    const forged = `${theirs.split('.')[0]}.${mine.split('.')[1]}`
    expect(await verifyUnsubscribeToken(forged, KEY)).toEqual({ ok: false })
    // And an honest token only ever names the project it was signed for.
    expect(await verifyUnsubscribeToken(mine, KEY)).toEqual({ ok: true, projectId: 'project-1' })
  })

  it('a token signed with another key is refused', async () => {
    const token = await signUnsubscribeToken('project-1', OTHER_KEY)
    expect(await verifyUnsubscribeToken(token, KEY)).toEqual({ ok: false })
  })

  it('refuses anything that is not a token', async () => {
    for (const junk of ['', '.', 'abc', 'abc.', '.abc', 'a.b.c', 'not base64!.sig', 'cHJvamVjdC0x', null, undefined, 42]) {
      expect(await verifyUnsubscribeToken(junk, KEY), String(junk)).toEqual({ ok: false })
    }
  })

  it('an unsigned token (empty signature) is refused', async () => {
    const id = (await signUnsubscribeToken('project-1', KEY)).split('.')[0]
    expect(await verifyUnsubscribeToken(`${id}.`, KEY)).toEqual({ ok: false })
  })

  it('fails closed without a key: nothing verifies, and nothing can be signed', async () => {
    const token = await signUnsubscribeToken('project-1', KEY)
    for (const missing of ['', undefined, null]) {
      expect(await verifyUnsubscribeToken(token, missing as unknown as string)).toEqual({ ok: false })
      await expect(signUnsubscribeToken('project-1', missing as unknown as string)).rejects.toThrow('signing key')
    }
  })

  it('a token made with an empty key is not accepted by an empty key either', async () => {
    // Guards against "HMAC with an empty key" quietly working on both sides.
    const id = (await signUnsubscribeToken('project-1', KEY)).split('.')[0]
    expect(await verifyUnsubscribeToken(`${id}.AAAA`, '')).toEqual({ ok: false })
  })

  it('refuses to sign for no project', async () => {
    await expect(signUnsubscribeToken('', KEY)).rejects.toThrow('project')
  })
})

describe('unsubscribeUrl', () => {
  it('is the app origin, the route, and the token', () => {
    expect(UNSUBSCRIBE_PATH).toBe('/api/unsubscribe')
    expect(unsubscribeUrl('https://bumpcheck.example', 'abc.def')).toBe('https://bumpcheck.example/api/unsubscribe?token=abc.def')
  })
})
