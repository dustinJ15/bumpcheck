/**
 * One run of the scan job: what the job handler does each time the job room
 * calls it, minus the platform.
 *
 * A scan takes several runs: one per tick (src/engine/tick.ts), plus one for
 * each retry. Between runs the job room keeps a checkpoint: the scan's state
 * and how many ticks have failed so far. `runScanJobRun` takes the
 * checkpoint, runs one tick, and says what the handler should do next:
 * continue later with a new checkpoint, or finish.
 *
 * The retry rule lives here (ledger item 24: a failed scan is retried once,
 * then shown as failed). It cannot be left to the job room's own retry
 * count, because the room counts every run as an attempt, including every
 * ordinary tick of a long scan.
 *
 * No platform imports, so the tests run it against the fakes.
 */

import { SCAN_PACING } from '../config'
import type { ScanReport } from '../core/model'
import { markCheckFailed, markScanFailed, startScan, type ScanServices, type ScanState } from './scan'
import { runScanTick } from './tick'

/** What the job saves between runs. Plain JSON. */
export interface ScanCheckpoint {
  scan: ScanState
  /** Ticks that have ended in an error so far in this scan. */
  failedTicks: number
}

export type ScanJobRun =
  /** Not finished: save the checkpoint and run again after `afterMs`. */
  | { next: 'continue'; checkpoint: ScanCheckpoint; afterMs: number }
  /** Finished. `reason` says why when the outcome is not "succeeded". */
  | { next: 'finish'; outcome: 'succeeded' | 'failed' | 'cancelled'; reason: string | null; report: ScanReport }

export function startScanCheckpoint(projectId: string, onDemand: boolean): ScanCheckpoint {
  return { scan: startScan(projectId, { onDemand }), failedTicks: 0 }
}

export async function runScanJobRun(
  services: ScanServices,
  checkpoint: ScanCheckpoint,
  options: {
    /** False on the last run the job room allows: the scan must not ask for another. */
    mayRunAgain: boolean
    isCancelled?: () => boolean
  },
): Promise<ScanJobRun> {
  const projectId = checkpoint.scan.projectId
  const tick = await runScanTick(services, checkpoint.scan, {
    outboundCallBudget: SCAN_PACING.outboundCallsPerTick,
    isCancelled: options.isCancelled,
  })
  const scan = tick.state

  // An on-demand job is a "check" to the user, and its failure is recorded
  // differently: the project's last full scan still stands (see markCheckFailed).
  const what = scan.onDemand ? 'check' : 'scan'
  const recordFailure = scan.onDemand ? markCheckFailed : markScanFailed

  /** Records the failure on the project (keeping its old results) and ends the job. */
  const giveUp = async (outcome: 'failed' | 'cancelled', reason: string): Promise<ScanJobRun> => {
    // If even this write fails there is nothing more the job can do.
    await recordFailure(services, projectId, reason).catch(() => {})
    return { next: 'finish', outcome, reason, report: scan.report }
  }

  switch (tick.stopped) {
    case 'done':
      return { next: 'finish', outcome: scan.outcome ?? 'failed', reason: scan.failureReason, report: scan.report }

    case 'budget':
      if (!options.mayRunAgain) return giveUp('failed', `The ${what} took too long and was stopped.`)
      return { next: 'continue', checkpoint: { scan, failedTicks: checkpoint.failedTicks }, afterMs: 0 }

    case 'cancelled':
      return giveUp('cancelled', `The ${what} was cancelled.`)

    case 'error': {
      const failedTicks = checkpoint.failedTicks + 1
      if (failedTicks < SCAN_PACING.failedTicksPerScan && options.mayRunAgain) {
        // Retry from the last step that completed.
        return { next: 'continue', checkpoint: { scan, failedTicks }, afterMs: SCAN_PACING.retryDelayMs }
      }
      return giveUp('failed', `The ${what} could not finish. Try again later.`)
    }
  }
}
