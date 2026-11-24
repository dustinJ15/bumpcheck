/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { projectsSchema } from './schemas/projects-schema'
import { publicReportsSchema } from './schemas/public-reports-schema'
import { verdictsSchema } from './schemas/verdicts-schema'
import { alertsSchema } from './schemas/alerts-schema'
import { usageSchema } from './schemas/usage-schema'
import { attemptsSchema } from './schemas/attempts-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  projectsSchema,
  publicReportsSchema,
  verdictsSchema,
  alertsSchema,
  usageSchema,
  attemptsSchema,
]
