/**
 * Real or fake? The one place the worker chooses its services.
 *
 * `servicesMode(env)` (./mode.ts) decides. With the fake-services setting on
 * (the local test server only), the registry, source host and judge are the
 * fakes in ./fake-world.ts and no real implementation is even constructed.
 * Otherwise they are npm, GitHub and Claude.
 *
 * Records are never faked here: both modes write to the record room through
 * the server-side record tools passed in.
 *
 * `tools` also decides who pays for GitHub: its `integration` function is
 * the scaffold's, which bills the app owner for an owner-billed integration
 * (src/integrations.ts).
 */

import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { noAlerts, type ScanServices } from '../engine/scan'
import { ClaudeJudge } from './claude-judge'
import { buildFakeWorld } from './fake-world'
import { GitHubSourceHost } from './github-source-host'
import { servicesMode } from './mode'
import { NpmRegistry } from './npm-registry'
import { RecordRoomStore, systemClock } from './record-room-store'
import type { SourceHost } from './types'

/** Everything a scan needs. Used by the scan job (src/jobs.ts). */
export function buildScanServices(env: Env, tools: ActionTools): ScanServices {
  const outside =
    servicesMode(env) === 'fake'
      ? buildFakeWorld()
      : {
          registry: new NpmRegistry(),
          sourceHost: new GitHubSourceHost(tools.integration),
          judge: new ClaudeJudge(env),
        }
  return {
    ...outside,
    store: new RecordRoomStore(tools),
    clock: systemClock,
    // Ticket 06 supplies the real alert step.
    alertHook: noAlerts,
  }
}

/** Just the source host. Used by the add-project action to check a repo. */
export function buildSourceHost(env: Env, tools: ActionTools): SourceHost {
  return servicesMode(env) === 'fake' ? buildFakeWorld().sourceHost : new GitHubSourceHost(tools.integration)
}
