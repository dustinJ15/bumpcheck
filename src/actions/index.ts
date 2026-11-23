/**
 * Server actions, by name. The browser calls one with
 * `POST /api/actions/<name>` (src/lib/actions.ts); the route in
 * src/server/action-routes.ts verifies the caller first.
 *
 * Every record write in bumpcheck goes through one of these (decision 14).
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { addProject } from './add-project'
import { testResetMyProjects } from './test-reset'

export const actions: Record<string, ActionHandler<Env>> = {
  'add-project': addProject,
  // Test-only; refuses unless the fake-services setting is on. See the file.
  'test-reset-my-projects': testResetMyProjects,
}
