/**
 * The report: a project's dependencies, sorted for reading.
 *
 * The project page and the projects list both show what these functions
 * return, so the rules live here and not in a component:
 *
 *   - which state a dependency is in (`rowState`),
 *   - which section of the page that state belongs to (`sectionOf`),
 *   - the order of sections and of rows inside one (`buildReport`),
 *   - which rows are "reviewed" and so moved out of the way,
 *   - how many breaking upgrades are still unreviewed (`countUnreviewedBreaking`).
 *
 * A dependency's state comes from its verdict when it has one, and from
 * semver triage otherwise. A minor or patch upgrade nobody asked about is
 * "not read", never "safe" (story 16).
 *
 * Pure: no I/O, no platform imports.
 */

import type { DependencyGroup, DependencyResult, Verdict } from './model'
import { verdictCovers } from './verdict-cover'

/** Every state a dependency can be shown in. */
export type RowState =
  | 'breaking' // read: breaks existing code
  | 'unclear' // read: the changelog is too vague to tell
  | 'failed' // the judge could not produce a verdict; can be retried
  | 'no-changelog' // nothing to read, so no AI call was made
  | 'pending' // a major upgrade no scan has read yet
  | 'safe' // read: no breaking change
  | 'not-read' // minor or patch, not read unless asked
  | 'up-to-date'
  | 'not-checked' // a spec bumpcheck cannot scan (git URL, local path, ...)

/** The six sections of a group, as the spec names them (story 11). */
export type SectionId = 'breaking' | 'unclear' | 'safe-major' | 'minor-patch' | 'up-to-date' | 'not-checked'

/** Sections appear in this order: what needs attention first. */
export const SECTION_ORDER: readonly SectionId[] = [
  'breaking',
  'unclear',
  'safe-major',
  'minor-patch',
  'up-to-date',
  'not-checked',
]

/** Inside a section, rows are ordered by state in this order, then by name. */
const STATE_ORDER: readonly RowState[] = [
  'breaking',
  'unclear',
  'failed',
  'no-changelog',
  'pending',
  'safe',
  'not-read',
  'up-to-date',
  'not-checked',
]

const GROUP_ORDER: readonly DependencyGroup[] = ['runtime', 'dev']

export interface ReportRow {
  dependency: DependencyResult
  /** The verdict attached to this upgrade, when it exists and has loaded. */
  verdict: Verdict | null
  state: RowState
  section: SectionId
}

export interface ReportSection {
  id: SectionId
  rows: ReportRow[]
}

export interface ReportGroup {
  group: DependencyGroup
  /** Rows in this group that are not reviewed. */
  count: number
  /** Only the sections that have rows, in `SECTION_ORDER`. */
  sections: ReportSection[]
}

export interface Report {
  /** Runtime first, then dev. A group with no unreviewed rows is still listed, with no sections. */
  groups: ReportGroup[]
  /** Rows the user marked as reviewed, runtime first. Shown in a collapsed section. */
  reviewed: ReportRow[]
  unreviewedBreaking: number
}

/** Verdicts by key, as loaded from the shared cache. */
export type VerdictsByKey = ReadonlyMap<string, Verdict>

/** The state one dependency is in, given its verdict (or null). */
export function rowState(dependency: DependencyResult, verdict: Verdict | null): RowState {
  if (verdict !== null) {
    if (verdict.status === 'failed') return 'failed'
    if (verdict.status === 'no-changelog') return 'no-changelog'
    if (verdict.label === 'breaking') return 'breaking'
    if (verdict.label === 'safe') return 'safe'
    return 'unclear'
  }
  switch (dependency.triage) {
    case 'major':
      return 'pending'
    case 'minor':
    case 'patch':
      return 'not-read'
    case 'up-to-date':
      return 'up-to-date'
    case 'not-checked':
      return 'not-checked'
  }
}

/**
 * The section a row is listed under. Anything bumpcheck could not settle
 * (unclear, failed, no changelog, not read yet) goes under "unclear". A
 * "safe" verdict on a minor or patch upgrade stays with the minor and patch
 * upgrades: "safe major" is for majors only.
 */
export function sectionOf(state: RowState, dependency: DependencyResult): SectionId {
  switch (state) {
    case 'breaking':
      return 'breaking'
    case 'unclear':
    case 'failed':
    case 'no-changelog':
    case 'pending':
      return 'unclear'
    case 'safe':
      return dependency.triage === 'major' ? 'safe-major' : 'minor-patch'
    case 'not-read':
      return 'minor-patch'
    case 'up-to-date':
      return 'up-to-date'
    case 'not-checked':
      return 'not-checked'
  }
}

/**
 * May this row be marked as reviewed? Only a row with a verdict, and not a
 * failed one: a failed verdict is retried, and a retry keeps its key, so a
 * reviewed failure would hide the real verdict when it arrives.
 */
export function isReviewable(row: Pick<ReportRow, 'verdict' | 'state'>): boolean {
  return row.verdict !== null && row.state !== 'failed'
}

/**
 * Sorts a project's dependencies into the report the page shows.
 *
 * `reviewedKeys` are the verdict keys the user marked as reviewed. A newer
 * verdict for the same package has a different key (see `verdictKey`), so
 * it is not in the list and shows up as new (story 34).
 */
export function buildReport(
  dependencies: readonly DependencyResult[],
  verdicts: VerdictsByKey,
  reviewedKeys: readonly string[],
): Report {
  const reviewedSet = new Set(reviewedKeys)
  const rows = dependencies.map((dependency) => toRow(dependency, verdicts))
  const isReviewed = (row: ReportRow) =>
    row.dependency.verdictKey !== undefined && reviewedSet.has(row.dependency.verdictKey) && isReviewable(row)

  const open = rows.filter((row) => !isReviewed(row))
  const groups = GROUP_ORDER.map((group): ReportGroup => {
    const inGroup = open.filter((row) => row.dependency.group === group)
    const sections = SECTION_ORDER.map((id) => ({
      id,
      rows: inGroup.filter((row) => row.section === id).sort(compareRows),
    })).filter((section) => section.rows.length > 0)
    return { group, count: inGroup.length, sections }
  })

  return {
    groups,
    reviewed: rows.filter(isReviewed).sort(compareReviewedRows),
    unreviewedBreaking: open.filter((row) => row.state === 'breaking').length,
  }
}

/** How many breaking upgrades the user has not yet marked as reviewed (story 35). */
export function countUnreviewedBreaking(
  dependencies: readonly DependencyResult[],
  verdicts: VerdictsByKey,
  reviewedKeys: readonly string[],
): number {
  return buildReport(dependencies, verdicts, reviewedKeys).unreviewedBreaking
}

/**
 * How many dependencies were left unread by each thing that can stop a
 * read: the per-scan cap, the app's daily AI ceiling, and GitHub refusing
 * the release notes. The project page shows a notice for each (stories 28, 29).
 */
export function countDeferred(dependencies: readonly DependencyResult[]): {
  scanCap: number
  dailyCeiling: number
  sourceRefused: number
} {
  const count = (reason: DependencyResult['deferredBy']) => dependencies.filter((dep) => dep.deferredBy === reason).length
  return { scanCap: count('scan-cap'), dailyCeiling: count('daily-ceiling'), sourceRefused: count('source-refused') }
}

/** The reviewed list with `key` added. The input is not changed. */
export function addReviewedKey(reviewedKeys: readonly string[], key: string): string[] {
  return reviewedKeys.includes(key) ? [...reviewedKeys] : [...reviewedKeys, key]
}

/** The reviewed list with `key` removed. The input is not changed. */
export function removeReviewedKey(reviewedKeys: readonly string[], key: string): string[] {
  return reviewedKeys.filter((k) => k !== key)
}

// ---------------------------------------------------------------- helpers

function toRow(dependency: DependencyResult, verdicts: VerdictsByKey): ReportRow {
  const stored = dependency.verdictKey === undefined ? undefined : verdicts.get(dependency.verdictKey)
  // A verdict read from a later version than this project is on is not this project's verdict.
  const verdict = stored !== undefined && verdictCovers(stored, dependency) ? stored : null
  const state = rowState(dependency, verdict)
  return { dependency, verdict, state, section: sectionOf(state, dependency) }
}

/** By state, then minor before patch, then by name. */
function compareRows(a: ReportRow, b: ReportRow): number {
  return (
    STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
    triageRank(a.dependency) - triageRank(b.dependency) ||
    a.dependency.name.localeCompare(b.dependency.name)
  )
}

/** Reviewed rows: runtime before dev, then as `compareRows`. */
function compareReviewedRows(a: ReportRow, b: ReportRow): number {
  return GROUP_ORDER.indexOf(a.dependency.group) - GROUP_ORDER.indexOf(b.dependency.group) || compareRows(a, b)
}

function triageRank(dependency: DependencyResult): number {
  return dependency.triage === 'patch' ? 1 : 0
}
