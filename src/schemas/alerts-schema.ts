/**
 * Alerts: the send log for email alerts and test emails.
 *
 * Owner-scoped by the user's id in `userId` (the schema's owner field):
 * a signed-in user reads only their own rows; signed-out visitors read
 * nothing. Only server code writes.
 */

import type { CollectionSchema } from 'deepspace/schema'

const NO_WRITES = { create: false, update: false, delete: false } as const

export const alertsSchema: CollectionSchema = {
  name: 'alerts',
  ownerField: 'userId',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'projectId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'sentAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
    // Verdict keys the email covered.
    { name: 'verdictKeys', storage: 'text', interpretation: 'json', default: [] },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: ['alert', 'test'] }, required: true },
    {
      name: 'outcome',
      storage: 'text',
      interpretation: { kind: 'select', options: ['sent', 'failed'] },
      required: true,
    },
    { name: 'failureReason', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: false, ...NO_WRITES },
    member: { read: 'own', ...NO_WRITES },
    admin: { read: 'own', ...NO_WRITES },
  },
}
