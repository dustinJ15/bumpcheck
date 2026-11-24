/**
 * Attempts: one row for each add-project request that got as far as GitHub,
 * so those can be capped per user per UTC day (src/config.ts,
 * `LIMITS.addAttemptsPerUserPerDay`).
 *
 * One row per attempt, not a counter: the add-project action writes its row
 * and then counts the user's rows for the day, so requests sent at the same
 * moment cannot slip past the cap between a read and a write.
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
  ],
  permissions: {
    viewer: NOTHING,
    member: NOTHING,
    admin: NOTHING,
  },
}
