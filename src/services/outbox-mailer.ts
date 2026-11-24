/**
 * The mailer the local test server uses: it sends nothing. Each message is
 * written to the server-only `outbox` collection instead
 * (src/schemas/outbox-schema.ts), where a browser test can read it through
 * the test-only `test-read-outbox` action.
 *
 * Chosen in src/services/wire.ts, and only when the fake-services setting
 * is on. Production never constructs it.
 *
 * One address is "down": a project in the fake repo named below cannot be
 * mailed, so a test can see a failed send in the log.
 */

import type { ActionTools } from 'deepspace/worker'
import type { Clock, Mailer, MailMessage, MailResult } from './types'

export const OUTBOX = 'outbox'

/** An email whose subject names this fake repo "fails to send". */
export const FAKE_MAIL_DOWN_REPO = 'bumpcheck-fake/mail-down'

export class OutboxMailer implements Mailer {
  constructor(
    private readonly tools: Pick<ActionTools, 'create'>,
    private readonly clock: Clock,
  ) {}

  async send(message: MailMessage): Promise<MailResult> {
    if (message.subject.includes(FAKE_MAIL_DOWN_REPO)) return { ok: false, error: 'The mail service answered 503 (fake).' }

    const written = await this.tools.create(OUTBOX, {
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.headers,
      replyTo: message.replyTo ?? null,
      sentAt: new Date(this.clock.now()).toISOString(),
    })
    return written.success ? { ok: true } : { ok: false, error: `The fake outbox could not be written: ${written.error}` }
  }
}
