/**
 * Usage: one row per UTC day counting AI calls app-wide, for the daily
 * ceiling (src/config.ts, `LIMITS.aiCallsPerDay`).
 *
 * Server-only: no role reads or writes it from a client.
 */

import type { CollectionSchema } from 'deepspace/schema'

const NOTHING = { read: false, create: false, update: false, delete: false } as const

export const usageSchema: CollectionSchema = {
  name: 'usage',
  uniqueOn: ['day'],
  columns: [
    // YYYY-MM-DD, UTC.
    { name: 'day', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'aiCalls', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  permissions: {
    viewer: NOTHING,
    member: NOTHING,
    admin: NOTHING,
  },
}
