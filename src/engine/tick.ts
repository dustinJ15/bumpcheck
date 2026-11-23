/**
 * One job tick's worth of a scan.
 *
 * A job tick has limited time and should make a limited number of outbound
 * calls, so a scan is spread over as many ticks as it needs. `runScanTick`
 * runs engine steps until the scan is done or the tick has made its budget
 * of outbound calls (registry, GitHub and judge calls; record-room calls
 * stay inside the app and are not counted). It returns the state to save for
 * the next tick. It does not throw: a step that fails ends the tick with
 * "error" and the last good state.
 *
 * The budget is checked between steps, so a tick can overshoot by at most
 * one step's calls. Steps are small (src/config.ts, `SCAN_PACING`).
 *
 * No platform imports: the job handler in src/jobs.ts is the thin layer that
 * calls this and talks to the job room.
 */

import { runScanStep, type ScanServices, type ScanState } from './scan'

export interface ScanTickResult {
  /** The state after the last step that completed. Save it to continue from there. */
  state: ScanState
  /**
   * Why the tick stopped. Only "done" means the scan is finished.
   * "error" means a step threw (a service is down, say): `state` is from
   * before that step, so running it again retries just that step.
   */
  stopped: 'done' | 'budget' | 'cancelled' | 'error'
  /** Outbound calls this tick made. */
  outboundCalls: number
  /** The thrown error's message, when `stopped` is "error". */
  error?: string
}

export async function runScanTick(
  services: ScanServices,
  startState: ScanState,
  options: { outboundCallBudget: number; isCancelled?: () => boolean },
): Promise<ScanTickResult> {
  const calls = { made: 0 }
  const counted = countOutboundCalls(services, calls)

  let state = startState
  while (state.step !== 'done') {
    // Once the results are written (only the alert step is left) the scan is
    // finished as far as its page is concerned, so a late cancel is ignored.
    if (state.step !== 'alert' && options.isCancelled?.()) {
      return { state, stopped: 'cancelled', outboundCalls: calls.made }
    }
    if (calls.made >= options.outboundCallBudget) return { state, stopped: 'budget', outboundCalls: calls.made }
    try {
      state = await runScanStep(counted, state)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { state, stopped: 'error', outboundCalls: calls.made, error: message }
    }
  }
  return { state, stopped: 'done', outboundCalls: calls.made }
}

/** Wraps the three outside services so each call adds one to `calls.made`. */
function countOutboundCalls(services: ScanServices, calls: { made: number }): ScanServices {
  const count = <T>(result: Promise<T>): Promise<T> => {
    calls.made++
    return result
  }
  const { registry, sourceHost, judge } = services
  return {
    ...services,
    registry: { getPackage: (name) => count(registry.getPackage(name)) },
    sourceHost: {
      getRepo: (repo) => count(sourceHost.getRepo(repo)),
      getFile: (repo, path, ref) => count(sourceHost.getFile(repo, path, ref)),
      getChangelog: (source) => count(sourceHost.getChangelog(source)),
      getReleases: (source) => count(sourceHost.getReleases(source)),
    },
    judge: { judge: (input) => count(judge.judge(input)) },
  }
}
