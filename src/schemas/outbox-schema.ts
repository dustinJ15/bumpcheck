/**
 * Outbox: the messages the fake mailer "sent" on the local test server.
 *
 * With the fake-services setting on, no email leaves the machine: the fake
 * mailer (src/services/outbox-mailer.ts) writes each message here instead,
 * so a browser test can read what would have been sent and follow its
 * unsubscribe link. In production the real mailer is used and nothing ever
 * writes to this collection: it stays empty.
 *
 * Server-only: no role reads or writes it from a client. A test reads it
 * through the test-only `test-read-outbox` action, which answers only when
 * the fake-services setting is on and returns only the caller's own mail.
 */

import type { CollectionSchema } from 'deepspace/schema'

const NOTHING = { read: false, create: false, update: false, delete: false } as const

export const outboxSchema: CollectionSchema = {
  name: 'outbox',
  columns: [
    { name: 'to', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'subject', storage: 'text', interpretation: 'plain', required: true },
    { name: 'html', storage: 'text', interpretation: 'plain' },
    { name: 'text', storage: 'text', interpretation: 'plain' },
    // Header name -> value.
    { name: 'headers', storage: 'text', interpretation: 'json', default: {} },
    { name: 'replyTo', storage: 'text', interpretation: 'plain' },
    { name: 'sentAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
  ],
  permissions: {
    viewer: NOTHING,
    member: NOTHING,
    admin: NOTHING,
  },
}
