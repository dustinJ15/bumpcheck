/**
 * Verdicts: the shared cache of changelog verdicts (decision 3).
 *
 * One row per package, current major and target major.minor, shared by
 * every project. The content is public package information, so every role
 * reads every row, signed-out visitors included. Only server code writes.
 *
 * Shapes of the JSON columns are in src/core/model.ts (`Verdict`).
 */

import type { CollectionSchema } from 'deepspace/schema'

const READ_ONLY = { read: true, create: false, update: false, delete: false } as const

export const verdictsSchema: CollectionSchema = {
  name: 'verdicts',
  uniqueOn: ['key'],
  columns: [
    // "express@4->5.1": see verdictKey in src/core/verdict.ts.
    { name: 'key', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'packageName', storage: 'text', interpretation: 'plain', required: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['ready', 'no-changelog', 'failed'] },
      required: true,
    },
    { name: 'label', storage: 'text', interpretation: { kind: 'select', options: ['breaking', 'safe', 'unclear'] } },
    { name: 'summary', storage: 'text', interpretation: 'plain' },
    // VerdictChange[]: title, whatChanged, apiNames, whatToDo. No confidence score.
    { name: 'changes', storage: 'text', interpretation: 'json', default: [] },
    { name: 'sourceUrl', storage: 'text', interpretation: { kind: 'url' } },
    { name: 'inputTruncated', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    // The exact versions judged.
    { name: 'fromVersion', storage: 'text', interpretation: 'plain', required: true },
    { name: 'toVersion', storage: 'text', interpretation: 'plain', required: true },
    { name: 'failureReason', storage: 'text', interpretation: 'plain' },
    { name: 'decidedAt', storage: 'text', interpretation: { kind: 'datetime' } },
  ],
  permissions: {
    viewer: READ_ONLY,
    member: READ_ONLY,
    admin: READ_ONLY,
  },
}
