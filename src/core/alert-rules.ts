/**
 * Which verdicts an alert email may tell a project's owner about.
 *
 * The rule (spec, "Alert step"): breaking verdicts that are neither reviewed
 * nor already alerted for this project. In full:
 *
 *   - "Breaking" and "not reviewed" mean exactly what they mean on the
 *     project page, so this starts from the same report the page draws
 *     (./report.ts): an email never names an upgrade the page does not
 *     show as an unreviewed breaking one.
 *   - "Already alerted" is read from two records, and either is enough: the
 *     project row's `alertedKeys`, and the alerts in the send log that were
 *     sent. Both are written after a send; reading both means one failed
 *     write cannot lead to the same news being emailed twice (story 40).
 *   - A verdict whose alert could not be sent is tried once more, with the
 *     next scan. After that it is left as failed (`mayTryAlertAgain`).
 *
 * A newer verdict for the same package has a different key (`verdictKey`),
 * so none of the above applies to it and it is news again.
 *
 * Pure: no I/O, no platform imports.
 */

import type { AlertItem } from './alert-email'
import { mayTryAlertAgain, utcDay, isoToTime } from './limits'
import type { AlertLogEntry, DependencyResult } from './model'
import { buildReport, type ReportRow, type VerdictsByKey } from './report'

interface ProjectVerdicts {
  dependencies: readonly DependencyResult[]
  /** The verdicts the dependencies point at, by key. */
  verdicts: VerdictsByKey
  reviewedKeys: readonly string[]
}

/** The breaking upgrades to put in this project's next alert email. Empty: nothing to send. */
export function pickAlertItems(
  input: ProjectVerdicts & {
    /** The project row's record of verdicts already alerted. */
    alertedKeys: readonly string[]
    /** The project's send log. */
    log: readonly AlertLogEntry[]
  },
): AlertItem[] {
  const alerted = alreadyAlertedKeys(input.alertedKeys, input.log)
  return unreviewedBreaking(input).filter(
    (item) => !alerted.has(item.verdictKey) && mayTryAlertAgain({ failedSends: failedSendsOf(input.log, item.verdictKey) }),
  )
}

/**
 * What a test email shows: the project's unreviewed breaking upgrades,
 * whether or not an alert has already gone out for them. A test email is a
 * preview, so the alert history does not apply to it.
 */
export function pickTestItems(input: ProjectVerdicts): AlertItem[] {
  return unreviewedBreaking(input)
}

/** Every verdict this project's owner has been emailed about: the project row's list plus the sent alerts in the log. */
export function alreadyAlertedKeys(alertedKeys: readonly string[], log: readonly AlertLogEntry[]): Set<string> {
  const keys = new Set(alertedKeys)
  for (const entry of log) {
    if (entry.kind === 'alert' && entry.outcome === 'sent') for (const key of entry.verdictKeys) keys.add(key)
  }
  return keys
}

/** How many alert emails that included this verdict could not be sent. */
export function failedSendsOf(log: readonly AlertLogEntry[], verdictKey: string): number {
  return log.filter((entry) => entry.kind === 'alert' && entry.outcome === 'failed' && entry.verdictKeys.includes(verdictKey)).length
}

/** How many alert emails were sent on a UTC day (YYYY-MM-DD). Test emails and failed sends are not counted. */
export function alertsSentOn(log: readonly AlertLogEntry[], day: string): number {
  return log.filter((entry) => {
    const time = isoToTime(entry.sentAt)
    return entry.kind === 'alert' && entry.outcome === 'sent' && time !== null && utcDay(time) === day
  }).length
}

// ---------------------------------------------------------------- helpers

/** The page's unreviewed breaking rows, runtime dependencies first, as email items. */
function unreviewedBreaking(input: ProjectVerdicts): AlertItem[] {
  const report = buildReport(input.dependencies, input.verdicts, input.reviewedKeys)
  return report.groups
    .flatMap((group) => group.sections)
    .filter((section) => section.id === 'breaking')
    .flatMap((section) => section.rows)
    .flatMap((row) => toItem(row))
}

function toItem(row: ReportRow): AlertItem[] {
  const { dependency, verdict } = row
  if (verdict === null || dependency.current === null || dependency.target === null) return []
  return [
    {
      verdictKey: verdict.key,
      packageName: dependency.name,
      group: dependency.group,
      fromVersion: dependency.current,
      toVersion: dependency.target,
      summary: verdict.summary ?? '',
      changeCount: verdict.changes.length,
      firstWhatToDo: verdict.changes[0]?.whatToDo ?? null,
      sourceUrl: verdict.sourceUrl,
    },
  ]
}
