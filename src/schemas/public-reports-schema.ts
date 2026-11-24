/**
 * Public reports: what a public project shows to people who are not its owner.
 *
 * One row per public project, with the project's id as the row's id. It is
 * a copy of the parts of the project row the public page shows (the repo,
 * the dependency list, the scan status and time) and nothing else: no user
 * id, no review state, no alert state. The row exists only while the
 * project is public. src/server/public-report.ts writes and removes it.
 *
 * Why a second collection instead of a read rule on `projects`: the
 * platform sends a reader whole rows and has no way to hide a column, and
 * a project row carries its owner's id (checked against deepspace 0.44.2:
 * a signed-out visitor reading a public project under the "published" rule
 * received `userId`, `createdBy`, the review list and the alert setting).
 *
 * Every role reads every row, signed-out visitors included: having the link
 * is all it takes, and a row only exists because its owner made it public.
 * No client can write: only server code does, and it writes as the app
 * owner, so the row's `createdBy` is the app's id, never the project owner's.
 *
 * Columns must match PUBLIC_REPORT_COLUMNS in src/core/public-report.ts
 * (src/schemas.test.ts checks it).
 */

import type { CollectionSchema } from 'deepspace/schema'

const READ_ONLY = { read: true, create: false, update: false, delete: false } as const

export const publicReportsSchema: CollectionSchema = {
  name: 'publicReports',
  uniqueOn: ['projectId'],
  columns: [
    // The same as the row's id. A column too, so the public page can ask for exactly one report.
    { name: 'projectId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'repoOwner', storage: 'text', interpretation: 'plain', required: true },
    { name: 'repoName', storage: 'text', interpretation: 'plain', required: true },
    // DependencyResult[], as on the project row.
    { name: 'dependencies', storage: 'text', interpretation: 'json', default: [] },
    {
      name: 'scanStatus',
      storage: 'text',
      interpretation: { kind: 'select', options: ['idle', 'queued', 'scanning', 'done', 'failed'] },
      default: 'idle',
    },
    { name: 'lastScanAt', storage: 'text', interpretation: { kind: 'datetime' } },
  ],
  permissions: {
    viewer: READ_ONLY,
    member: READ_ONLY,
    admin: READ_ONLY,
  },
}
