/**
 * Attempts: one row for each request that is capped per user per UTC day.
 * Two kinds (src/config.ts has both numbers):
 *
 *   add-project  an add-project request that got as far as GitHub
 *                (`LIMITS.addAttemptsPerUserPerDay`)
 *   test-email   a test email from a project's settings page
 *                (`LIMITS.testEmailsPerUserPerDay`)
 *
 * One row per attempt, not a counter: the action writes its row and then
 * counts the user's rows of that kind for the day, so requests sent at the
 * same moment cannot slip past the cap between a read and a write.
 *
 * Test emails are counted here and not from the send log, because the send
 * log is deleted with its project: counting from it would let a user reset
 * their allowance by deleting a project and adding it again.
 *
 * Server-only: no role reads or writes it from a client.
 */

import type { CollectionSchema } from 'deepspace/schema'

const NOTHING = { read: false, create: false, update: false, delete: false } as const

export const attemptsSchema: CollectionSchema = {
  name: 'attempts',
  columns: [
    // The user who made the attempt. Not the schema's owner field: nobody reads these rows.
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    // YYYY-MM-DD, UTC.
    { name: 'day', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'kind',
      storage: 'text',
      interpretation: { kind: 'select', options: ['add-project', 'test-email'] },
      required: true,
      immutable: true,
    },
  ],
  permissions: {
    viewer: NOTHING,
    member: NOTHING,
    admin: NOTHING,
  },
}
