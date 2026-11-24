/**
 * Projects: one public GitHub repo a user watches.
 *
 * Every write goes through server code (decision 14): no role, not even
 * admin, may create, update or delete from a client. Server code writes as
 * the app owner, so the row carries the user's id in `userId`, the schema's
 * owner field, and the "own" part of the read rules checks that column.
 *
 * Reads use the platform's "published" rule: a caller reads a row they own,
 * or any row whose `visibility` is "public". Signed-out visitors (viewer
 * role) therefore see public projects only.
 *
 * `userId` is deliberately not `userBound`: that would stamp the writer's id,
 * and the writer is always the owner's server context, never the user.
 *
 * Shapes of the JSON columns are in src/core/model.ts.
 */

import type { CollectionSchema } from 'deepspace/schema'

const NO_WRITES = { create: false, update: false, delete: false } as const

export const projectsSchema: CollectionSchema = {
  name: 'projects',
  ownerField: 'userId',
  visibilityField: 'visibility',
  uniqueOn: ['userId', 'repoOwner', 'repoName'],
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'visibility',
      storage: 'text',
      interpretation: { kind: 'select', options: ['private', 'public'] },
      default: 'private',
    },
    // The repo.
    { name: 'repoOwner', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'repoName', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'defaultBranch', storage: 'text', interpretation: 'plain' },
    // Triage results: DependencyResult[], each with a pointer to its verdict.
    { name: 'dependencies', storage: 'text', interpretation: 'json', default: [] },
    // Scan state.
    {
      name: 'scanStatus',
      storage: 'text',
      interpretation: { kind: 'select', options: ['idle', 'queued', 'scanning', 'done', 'failed'] },
      default: 'idle',
    },
    { name: 'scanProgress', storage: 'text', interpretation: 'json' },
    { name: 'scanReport', storage: 'text', interpretation: 'json' },
    { name: 'scanError', storage: 'text', interpretation: 'plain' },
    { name: 'lastScanAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'nextDueAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'lastScanRequestedAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'lastOpenedAt', storage: 'text', interpretation: { kind: 'datetime' } },
    // When the scan was queued or last wrote progress. The scheduled task
    // marks a queued or scanning project failed when this gets too old.
    { name: 'scanHeartbeatAt', storage: 'text', interpretation: { kind: 'datetime' } },
    // Package names the next on-demand job should read (string[]). The job
    // payload carries only the project id, so the request is recorded here.
    { name: 'checkRequests', storage: 'text', interpretation: 'json', default: [] },
    // Triage: verdict keys the user marked as reviewed.
    { name: 'reviewedKeys', storage: 'text', interpretation: 'json', default: [] },
    // Email alerts: off by default (story 38), and the verdict keys already alerted.
    { name: 'alertsEnabled', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    { name: 'alertedKeys', storage: 'text', interpretation: 'json', default: [] },
  ],
  permissions: {
    viewer: { read: 'published', ...NO_WRITES },
    member: { read: 'published', ...NO_WRITES },
    admin: { read: 'published', ...NO_WRITES },
  },
}
