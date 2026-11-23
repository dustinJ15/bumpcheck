/**
 * What a user may ask the project page's server actions to do.
 *
 * Each function is the rule for one kind of request, as a pure yes/no with a
 * message for the user when the answer is no. The server actions in
 * src/actions/ load the rows, call these, and only then write or enqueue.
 * Who the caller is, and whether they own the project, is checked before
 * these run (src/actions/own-project.ts).
 *
 * Pure: no I/O, no platform imports.
 */

import type { DependencyResult, ScanStatus, Verdict, VerdictStatus } from './model'
import { verdictCovers } from './verdict-cover'

/** "check": read a minor or patch upgrade. "retry": judge a failed verdict again. */
export type OnDemandKind = 'check' | 'retry'

export type RequestCheck = { ok: true } | { ok: false; refusal: string; message: string }

function refuse(refusal: string, message: string): RequestCheck {
  return { ok: false, refusal, message }
}

/**
 * May this on-demand read be enqueued?
 *
 * Both kinds end in an AI call, so the rules here keep that call to the
 * cases the spec allows:
 *   - one scan at a time per project (decision 8), and only on top of a
 *     finished scan, whose results the read is added to;
 *   - "check" is for a minor or patch upgrade that has no verdict covering
 *     it yet (majors are read by scans; a verdict is never paid for twice);
 *   - "retry" is for a dependency whose verdict failed, and nothing else.
 *
 * The per-scan cap and the daily AI ceiling are not checked here: the scan
 * engine checks them when the job runs, as it does for every scan.
 */
export function checkOnDemandRequest(input: {
  kind: OnDemandKind
  scanStatus: ScanStatus
  /** The project's entry for the requested package, if it has one. */
  dependency: DependencyResult | undefined
  /** The stored verdict that dependency points at. Null when there is none. */
  verdict: Pick<Verdict, 'status' | 'fromVersion'> | null
}): RequestCheck {
  const { kind, scanStatus, dependency, verdict } = input

  if (dependency === undefined) {
    return refuse('not-a-dependency', "That package is not one of this project's dependencies.")
  }
  if (scanStatus === 'queued' || scanStatus === 'scanning') {
    return refuse('scan-running', 'A scan is already running for this project. Try again when it finishes.')
  }
  if (scanStatus !== 'done') {
    return refuse('scan-not-finished', 'This project has no finished scan to add to. Wait for its next scan.')
  }

  // A verdict that was read from a later version than this project is on is
  // not this project's verdict (./verdict-cover.ts): it counts as none.
  const verdictStatus = verdict !== null && verdictCovers(verdict, dependency) ? verdict.status : null

  if (kind === 'retry') {
    if (verdictStatus !== 'failed') return refuse('not-failed', 'Only a failed verdict can be retried.')
    return { ok: true }
  }

  if (dependency.triage !== 'minor' && dependency.triage !== 'patch') {
    return refuse('not-minor-or-patch', 'Only minor and patch upgrades can be checked on request.')
  }
  if (verdictStatus !== null) return refuse('already-read', 'This upgrade has already been read.')
  return { ok: true }
}

/**
 * May this verdict be marked as reviewed (or un-marked) on this project?
 * The key must belong to one of the project's own dependencies, so the
 * reviewed list cannot be filled with arbitrary text, and the verdict must
 * exist and not be a failed one (see `isReviewable` in report.ts).
 */
export function checkReviewRequest(input: {
  dependencies: readonly DependencyResult[]
  /** Straight from the request: not trusted to be a string. */
  verdictKey: unknown
  /** Status of the stored verdict with that key. Null when there is none. */
  verdictStatus: VerdictStatus | null
}): RequestCheck {
  const { dependencies, verdictKey, verdictStatus } = input
  const attached =
    typeof verdictKey === 'string' && verdictKey !== '' && dependencies.some((dep) => dep.verdictKey === verdictKey)
  if (!attached) return refuse('not-a-verdict', "That verdict is not part of this project's report.")
  if (verdictStatus === null) return refuse('not-a-verdict', "That verdict is not part of this project's report.")
  if (verdictStatus === 'failed') return refuse('failed-verdict', 'A failed verdict cannot be reviewed. Retry it instead.')
  return { ok: true }
}
