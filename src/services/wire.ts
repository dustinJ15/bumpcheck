/**
 * Real or fake? The one place the worker chooses its services.
 *
 * `servicesMode(env)` (./mode.ts) decides. With the fake-services setting on
 * (the local test server only), the registry, source host and judge are the
 * fakes in ./fake-world.ts and no real implementation is even constructed.
 * Otherwise they are npm, GitHub and Claude. The mailer is chosen the same
 * way (`buildAlertServices`).
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
import { appOrigin } from '../core/app-origin'
import { alertHookFor, type AlertServices } from '../engine/alert'
import type { ScanServices } from '../engine/scan'
import { ClaudeJudge } from './claude-judge'
import { EmailMailer } from './email-mailer'
import { buildFakeWorld } from './fake-world'
import { GitHubSourceHost } from './github-source-host'
import { servicesMode } from './mode'
import { NpmRegistry } from './npm-registry'
import { OutboxMailer } from './outbox-mailer'
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
    // After a successful full scan: the alert step (src/engine/alert.ts).
    alertHook: alertHookFor(buildAlertServices(env, tools), (outcome) => {
      // What happened, for the worker's log: sent or not, and why not. No
      // address, key or token is in an outcome. A failed send's reason is
      // the mail service's own words, so it goes to the project's send log
      // (which only its owner reads) and not here.
      const reason = !outcome.sent && outcome.why === 'error' ? ` ${outcome.reason}` : ''
      console.info(`[alert] ${outcome.sent ? `sent, ${outcome.verdictKeys.length} verdicts` : `not sent: ${outcome.why}`}${reason}`)
    }),
  }
}

/**
 * Everything an email needs. Used by the scan job (through the alert hook
 * above) and by the test-email action.
 *
 * With the fake-services setting on, the mailer sends nothing: it writes
 * each message to the `outbox` collection. Otherwise it is the email
 * integration, which `tools.integration` bills to the app owner.
 *
 * This is the one place the unsubscribe signing key is read for sending.
 * It goes to the alert step as an argument and from there into the signed
 * link; it is never logged or returned.
 */
export function buildAlertServices(env: Env, tools: ActionTools): AlertServices {
  return {
    store: new RecordRoomStore(tools),
    mailer: servicesMode(env) === 'fake' ? new OutboxMailer(tools, systemClock) : new EmailMailer(tools.integration),
    clock: systemClock,
    appOrigin: appOrigin(env),
    signingKey: env.UNSUBSCRIBE_SIGNING_KEY,
  }
}

/** Just the source host. Used by the add-project action to check a repo. */
export function buildSourceHost(env: Env, tools: ActionTools): SourceHost {
  return servicesMode(env) === 'fake' ? buildFakeWorld().sourceHost : new GitHubSourceHost(tools.integration)
}
