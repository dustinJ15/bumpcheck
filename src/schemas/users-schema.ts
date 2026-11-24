/**
 * The platform's users collection: one row per signed-in user, filled from
 * the verified sign-in (id, email, name, picture, role). bumpcheck reads it
 * in one place, on the server: the alert step takes the recipient's address
 * from it (RecordRoomStore.getUserEmail).
 *
 * Nobody but the user themself and the app owner may read a user's row:
 *   - `read: 'own'` for viewers and members guards the rows themselves;
 *   - `roster: 'read-policy'` applies the same rule to the room's user list
 *     (`user.list`). The platform default ('public-identity') would give every
 *     signed-in member every other user's id, name and picture.
 * A signed-out visitor gets no one. tests/sharing.spec.ts checks all three.
 */

import { USERS_COLUMNS, type CollectionSchema } from 'deepspace/schema'

export const usersSchema: CollectionSchema = {
  name: 'users',
  columns: [...USERS_COLUMNS],
  roster: 'read-policy',
  permissions: {
    viewer: { read: 'own', create: false, update: 'own', delete: false },
    member: { read: 'own', create: false, update: 'own', delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
