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
import { checkDependency, retryVerdict } from './on-demand'
import { markReviewed, recordOpened, undoReviewed } from './review'
import { testResetFakeWorld, testResetMyProjects } from './test-reset'

export const actions: Record<string, ActionHandler<Env>> = {
  'add-project': addProject,
  // The project page (ticket 03). Each checks that the project is the caller's first.
  'check-dependency': checkDependency,
  'retry-verdict': retryVerdict,
  'mark-reviewed': markReviewed,
  'undo-reviewed': undoReviewed,
  'record-opened': recordOpened,
  // Test-only; refuses unless the fake-services setting is on. See the file.
  'test-reset-my-projects': testResetMyProjects,
  'test-reset-fake-world': testResetFakeWorld,
}
