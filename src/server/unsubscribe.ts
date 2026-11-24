/**
 * The unsubscribe route's logic: what the link at the bottom of an alert
 * email does. Public, no sign-in (story 43). The route itself is registered
 * in ./http-routes.ts; this file has no HTTP in it, so it is unit-tested.
 *
 *   GET   someone opened the link. Shows a page with one button. Changes
 *         nothing, because mail scanners and link previews open links too.
 *   POST  the one click: the page's button, or a mail client's own
 *         "unsubscribe" button (RFC 8058, the List-Unsubscribe-Post
 *         header). Turns alerts off for the project the token names.
 *
 * What it can do is fixed here, not left to the caller: its one write is
 * `{ alertsEnabled: false }` on the one project the verified token names.
 * It cannot turn alerts on, touch another project, or read anything back
 * to the visitor but the repo's name.
 *
 * Fails closed. The signing key is an argument (the route passes
 * `env.UNSUBSCRIBE_SIGNING_KEY`); when it is missing no token is accepted,
 * nothing is looked up, and nothing is written. The key never appears in a
 * page or a log line.
 */

import type { ActionTools } from 'deepspace/worker'
import { renderUnsubscribePage, type UnsubscribePage } from '../core/unsubscribe-page'
import { verifyUnsubscribeToken } from '../core/unsubscribe-token'

/** The record tools this route needs, and no more. They must be the app owner's (RBAC off): the visitor has no identity. */
export type UnsubscribeTools = Pick<ActionTools, 'get' | 'update'>

export interface UnsubscribeReply {
  status: 200 | 400 | 500 | 503
  html: string
}

export async function handleUnsubscribe(input: {
  method: 'GET' | 'POST'
  /** The `token` query parameter, as it arrived. */
  token: unknown
  signingKey: string | undefined
  tools: UnsubscribeTools
}): Promise<UnsubscribeReply> {
  if (!input.signingKey) return reply(503, { kind: 'cannot-check' })

  const check = await verifyUnsubscribeToken(input.token, input.signingKey)
  if (!check.ok) return reply(400, { kind: 'invalid' })
  const projectId = check.projectId

  const found = await input.tools.get('projects', projectId)
  if (!found.success) {
    // A deleted project sends no alerts: for the visitor, that is "off".
    if (found.error.startsWith('Record not found')) return reply(200, { kind: 'done', repo: null })
    return reply(500, { kind: 'failed' })
  }
  const data = found.data.record.data
  const repo = `${String(data.repoOwner)}/${String(data.repoName)}`
  const alertsOn = data.alertsEnabled === true || data.alertsEnabled === 1

  if (input.method === 'GET') {
    return alertsOn
      ? reply(200, { kind: 'confirm', repo, token: String(input.token) })
      : reply(200, { kind: 'already-off', repo })
  }

  // The one write this route makes.
  const updated = await input.tools.update('projects', projectId, { alertsEnabled: false })
  if (!updated.success) return reply(500, { kind: 'failed' })
  return reply(200, { kind: 'done', repo })
}

function reply(status: UnsubscribeReply['status'], page: UnsubscribePage): UnsubscribeReply {
  return { status, html: renderUnsubscribePage(page) }
}
