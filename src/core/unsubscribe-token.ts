/**
 * Unsubscribe tokens: the signed part of the link at the bottom of every
 * alert email. A token names exactly one project and proves the app made it,
 * so the unsubscribe route can turn that project's alerts off for someone
 * who is not signed in, and can do nothing else.
 *
 *   token = base64url(project id) + "." + base64url(HMAC-SHA256(key, project id))
 *
 * The key is an argument. This module never reads the environment: the
 * worker passes `env.UNSUBSCRIBE_SIGNING_KEY`, tests pass a throwaway.
 *
 * Fails closed. Without a key nothing can be signed (it throws) and nothing
 * verifies, so a worker that is missing its secret cannot be talked into
 * accepting an unsigned link, or one signed with an empty key.
 *
 * A token has no expiry: an unsubscribe link in a year-old email must still
 * work. It cannot be used to turn alerts on, read anything, or act on
 * another project.
 *
 * Uses Web Crypto (`crypto.subtle`), which both the worker and Node have.
 * Pure otherwise: no I/O, no platform imports.
 */

/** The route that takes a token (src/server/unsubscribe.ts). */
export const UNSUBSCRIBE_PATH = '/api/unsubscribe'

export type TokenCheck = { ok: true; projectId: string } | { ok: false }

const REFUSED: TokenCheck = { ok: false }

/** The link an email carries: the app's own origin, the route, the token. */
export function unsubscribeUrl(appOrigin: string, token: string): string {
  return `${appOrigin}${UNSUBSCRIBE_PATH}?token=${token}`
}

export async function signUnsubscribeToken(projectId: string, key: string): Promise<string> {
  if (projectId === '') throw new Error('an unsubscribe token needs a project')
  const hmacKey = await importKey(key, 'sign')
  if (hmacKey === null) throw new Error('the unsubscribe signing key is missing')
  const id = new TextEncoder().encode(projectId)
  const signature = await crypto.subtle.sign('HMAC', hmacKey, id)
  return `${toBase64Url(id)}.${toBase64Url(new Uint8Array(signature))}`
}

/** Which project a token names, if the token is one this key signed. */
export async function verifyUnsubscribeToken(token: unknown, key: string): Promise<TokenCheck> {
  if (typeof token !== 'string') return REFUSED
  const parts = token.split('.')
  if (parts.length !== 2) return REFUSED
  const id = fromBase64Url(parts[0])
  const signature = fromBase64Url(parts[1])
  if (id === null || signature === null || id.length === 0 || signature.length === 0) return REFUSED

  const hmacKey = await importKey(key, 'verify')
  if (hmacKey === null) return REFUSED
  // `verify` compares in constant time, so a wrong guess learns nothing from how long it took.
  const genuine = await crypto.subtle.verify('HMAC', hmacKey, signature, id)
  if (!genuine) return REFUSED

  return { ok: true, projectId: new TextDecoder().decode(id) }
}

/** Null when there is no key to import: the callers above refuse. */
async function importKey(key: string, usage: 'sign' | 'verify'): Promise<CryptoKey | null> {
  if (typeof key !== 'string' || key === '') return null
  return crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** Null unless `text` is exactly what `toBase64Url` would write for some bytes. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    // One spelling per value: a token with stray bits in its last character is not ours.
    return toBase64Url(bytes) === text ? bytes : null
  } catch {
    return null
  }
}
