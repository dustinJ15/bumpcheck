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
import { scanNow } from './scan-now'
import {
  testResetFakeWorld,
  testResetMyProjects,
  testRunScheduledTask,
  testSetProjectTimes,
  testUseUpDailyAiLimit,
} from './test-reset'

export const actions: Record<string, ActionHandler<Env>> = {
  'add-project': addProject,
  // The project page (ticket 03). Each checks that the project is the caller's first.
  'check-dependency': checkDependency,
  'retry-verdict': retryVerdict,
  'mark-reviewed': markReviewed,
  'undo-reviewed': undoReviewed,
  'record-opened': recordOpened,
  // Scheduling and limits (ticket 04). Also the retry of a failed scan.
  'scan-now': scanNow,
  // Test-only; each refuses unless the fake-services setting is on. See the file.
  'test-reset-my-projects': testResetMyProjects,
  'test-reset-fake-world': testResetFakeWorld,
  'test-set-project-times': testSetProjectTimes,
  'test-use-up-daily-ai-limit': testUseUpDailyAiLimit,
  'test-run-scheduled-task': testRunScheduledTask,
}
