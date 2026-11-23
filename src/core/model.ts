/**
 * The shapes bumpcheck's logic passes around. Pure types: no I/O, no
 * platform imports. The record schemas in src/schemas/ store these shapes.
 */

/** Which `package.json` block a dependency came from. */
export type DependencyGroup = 'runtime' | 'dev'

/** How far behind a dependency is. Decided by semver alone, never by AI. */
export type TriageClass = 'up-to-date' | 'patch' | 'minor' | 'major' | 'not-checked'

/** Why a dependency could not be checked. */
export type NotCheckedReason =
  | 'git' // a git URL or GitHub shorthand
  | 'local' // file:, link: or a filesystem path
  | 'workspace' // workspace: protocol
  | 'alias' // npm: alias to another package
  | 'url' // a tarball URL
  | 'unbounded' // "*", "x" or "": every version allowed, so no lowest version
  | 'tag' // a dist-tag such as "latest" or "next"
  | 'invalid-range' // not a semver range at all
  | 'unpublished' // the registry does not know the package
  | 'no-stable-release' // the registry has only prereleases

/** One dependency after triage, plus the verdict attached to it (if any). */
export interface DependencyResult {
  name: string
  group: DependencyGroup
  /** The range exactly as written in package.json. */
  declared: string
  /** The lowest version the declared range allows. Null when not checked. */
  current: string | null
  /** The registry's latest stable version. Null when not checked. */
  target: string | null
  triage: TriageClass
  notCheckedReason?: NotCheckedReason
  /** Key of the shared verdict for this upgrade, when one exists. */
  verdictKey?: string
  /**
   * Set when a major upgrade has no verdict yet because a limit stopped this
   * scan: the per-scan cap or the app's daily AI ceiling.
   */
  deferredBy?: 'scan-cap' | 'daily-ceiling'
}

/** Where a package's source lives on GitHub, as the registry reports it. */
export interface SourceRepo {
  owner: string
  repo: string
  /** Monorepo subfolder holding the package, if the registry names one. */
  directory?: string
}

/** One structured change inside a verdict. */
export interface VerdictChange {
  title: string
  whatChanged: string
  /** Exact API names affected (functions, options, exports). Feeds impact analysis. */
  apiNames: string[]
  whatToDo: string
}

export type VerdictLabel = 'breaking' | 'safe' | 'unclear'
export type VerdictStatus = 'ready' | 'no-changelog' | 'failed'

/**
 * A stored verdict. Shared by every project: keyed by package, current major
 * (0.minor for a 0.x version) and target major.minor (see `verdictKey` in
 * verdict.ts).
 */
export interface Verdict {
  key: string
  packageName: string
  status: VerdictStatus
  /** Present when status is "ready". */
  label?: VerdictLabel
  summary?: string
  changes: VerdictChange[]
  /** Link to the changelog or releases page the verdict was read from (or should be). */
  sourceUrl: string | null
  /** True when the changelog was cut at the input cap. */
  inputTruncated: boolean
  /** The exact versions judged. */
  fromVersion: string
  toVersion: string
  /** Present when status is "failed". */
  failureReason?: string
  /** ISO time the verdict was written. */
  decidedAt: string
}

/** What a scan reports about the limits it ran into. */
export interface ScanReport {
  /** Majors that got a new AI verdict (or a stored failure) in this scan. */
  judged: number
  /** Majors left for later scans because the per-scan cap was reached. */
  deferredByScanCap: number
  /** Majors left for later because the app's daily AI ceiling was reached. */
  deferredByDailyCeiling: number
}

export type ScanStatus = 'idle' | 'queued' | 'scanning' | 'done' | 'failed'

/** Live scan progress, written to the project row so its owner can watch it. */
export interface ScanProgress {
  step: string
  message: string
  /** Units done and total for the current step, when it has units. */
  done: number
  total: number
}

/** The repo a project points at. */
export interface RepoRef {
  owner: string
  repo: string
}

/**
 * The part of a project row the scan engine reads and writes. The record
 * store maps this onto the `projects` collection.
 */
export interface ProjectScanFields {
  repoOwner: string
  repoName: string
  defaultBranch: string | null
  dependencies: DependencyResult[]
  scanStatus: ScanStatus
  scanProgress: ScanProgress | null
  scanReport: ScanReport | null
  scanError: string | null
  /** ISO times. */
  lastScanAt: string | null
  nextDueAt: string | null
  /**
   * Package names an on-demand job should read ("check this one", or a
   * retry of a failed verdict). Written by the server action before it
   * enqueues the job, because the job's payload carries only the project id.
   * Emptied when the job ends.
   */
  checkRequests: string[]
}
