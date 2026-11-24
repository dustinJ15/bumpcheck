/**
 * The real mailer: the platform's email integration, billed to the app
 * owner (src/integrations.ts).
 *
 * Checked against the installed `deepspace` 0.44.2 catalog
 * (`npx deepspace integrations info email/send`): the one endpoint is
 * `email/send`; `to` and `subject` are required; `html`, `text`, `reply_to`
 * and `headers` are accepted. The platform always sends from its own shared
 * address and ignores any `from`, so none is given.
 *
 * Each message goes to exactly one address, the one the alert step read
 * from the platform's record of the user. There is no cc or bcc.
 *
 * The integration is injected as a function, so this file needs nothing
 * from the platform. The two pure helpers are unit-tested. The class itself
 * is never called by a test: only the supervisor's live check and
 * production send mail.
 */

import type { IntegrationCall, IntegrationReply } from './github-source-host'
import type { Mailer, MailMessage, MailResult } from './types'

export const EMAIL_SEND_ENDPOINT = 'email/send'

export class EmailMailer implements Mailer {
  constructor(private readonly callIntegration: IntegrationCall) {}

  async send(message: MailMessage): Promise<MailResult> {
    return readEmailSendReply(await this.callIntegration(EMAIL_SEND_ENDPOINT, emailSendInput(message)))
  }
}

/** The request body for `email/send`. */
export function emailSendInput(message: MailMessage): Record<string, unknown> {
  return {
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    // List-Unsubscribe and List-Unsubscribe-Post (src/core/alert-email.ts).
    headers: message.headers,
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
  }
}

/** Sent only when the integration says so. Anything else is a failure with its reason. */
export function readEmailSendReply(reply: IntegrationReply): MailResult {
  if (reply.success) return { ok: true }
  return { ok: false, error: reply.error || 'The email service refused the message.' }
}
