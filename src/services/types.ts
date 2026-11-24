/**
 * The outside world, as interfaces.
 *
 * The scan engine talks only to these. Production passes real
 * implementations (tickets 02 and 06); tests and the local test server pass
 * the fakes in ./fakes.ts. Which set the worker uses is decided in ./wire.ts. This file is the one seam the spec allows
 * ("Testing Decisions"), so it imports nothing from `deepspace`.
 */

import type { ReleaseNote } from '../core/changelog'
import type { AlertLogEntry, ProjectScanFields, RepoRef, SourceRepo, Verdict } from '../core/model'
import type { VerdictPromptInput, VerdictResponse } from '../core/verdict'

// ---------------------------------------------------------------- registry

/** What the package registry knows about one package. */
export interface RegistryPackage {
  /** The `latest` dist-tag. */
  latest: string | null
  /**
   * Published versions. Triage reads this only when `latest` is a
   * prerelease (to find the highest stable version), so an implementation
   * may list just `latest` when `latest` is stable.
   */
  versions: string[]
  /** Where the source lives on GitHub, if the package says. */
  source: SourceRepo | null
}

/** The npm registry. Real: plain `fetch` to registry.npmjs.org. */
export interface PackageRegistry {
  /** Null when the package is not published (or is private). */
  getPackage(name: string): Promise<RegistryPackage | null>
}

// ------------------------------------------------------------- source host

export interface RepoInfo {
  defaultBranch: string
}

/** A changelog or release list, with the link it was read from. */
export interface ChangelogFile {
  text: string
  url: string
}

export interface ReleaseList {
  releases: ReleaseNote[]
  url: string
}

/**
 * What asking for a package's release notes can end in. "none" and
 * "refused" are kept apart on purpose: "none" is a fact about the package
 * and may be remembered, "refused" (a rate limit, a network failure) says
 * nothing about the package, so the engine stores no verdict and a later
 * scan asks again.
 */
export type ReleasesAnswer =
  | ({ status: 'found' } & ReleaseList)
  /** The repo has no release notes. */
  | { status: 'none' }
  /** GitHub would not answer this time. */
  | { status: 'refused' }

/**
 * GitHub. Real: the GitHub integration for repo metadata and files; GitHub's
 * public Releases API over plain `fetch` for release notes.
 */
export interface SourceHost {
  /** Null when the repo does not exist or is not public. */
  getRepo(repo: RepoRef): Promise<RepoInfo | null>
  /** A file's text at a ref. Null when the file does not exist. */
  getFile(repo: RepoRef, path: string, ref: string): Promise<string | null>
  /** A package's CHANGELOG.md (in its monorepo folder, if it has one). Null when there is none. */
  getChangelog(source: SourceRepo): Promise<ChangelogFile | null>
  /** A package's GitHub release notes, or why there are none to read. Does not throw for a refusal. */
  getReleases(source: SourceRepo): Promise<ReleasesAnswer>
}

// ------------------------------------------------------------------- judge

/** A judge either returns a validated verdict or says why it could not. */
export type JudgeResult =
  | { ok: true; verdict: VerdictResponse }
  | { ok: false; error: string }

/** Reads a changelog and returns a verdict. Real: Claude via the platform's AI helper. */
export interface Judge {
  judge(input: VerdictPromptInput): Promise<JudgeResult>
}

// ------------------------------------------------------------------ mailer

export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
  headers: Record<string, string>
  /** Where a reply goes. Left out when the app has no address for replies (src/config.ts). */
  replyTo?: string
}

export type MailResult = { ok: true } | { ok: false; error: string }

/**
 * Sends one composed message. Real: the email integration
 * (./email-mailer.ts). The sender is not part of a message: the integration
 * always sends from the platform's shared address.
 */
export interface Mailer {
  send(message: MailMessage): Promise<MailResult>
}

// ------------------------------------------------------------ record store

/** A project as the scan engine sees it. */
export interface ProjectRecord extends ProjectScanFields {
  id: string
  /** The user who owns the project (the schema's owner field). */
  userId: string
  /** ISO time the owner last opened the project's page. Written by a server action, read by the schedule. */
  lastOpenedAt: string | null
  /** Verdict keys the owner marked as reviewed. Written by a server action, read by the alert step. */
  reviewedKeys: string[]
  /** The owner's alert setting. Off unless they turned it on. */
  alertsEnabled: boolean
  /** Verdict keys an alert email has already covered. Written by the alert step only. */
  alertedKeys: string[]
}

/**
 * The app's records, in the terms the engine needs. Real: the platform's
 * record room, reached with owner context from a job.
 */
export interface RecordStore {
  getProject(projectId: string): Promise<ProjectRecord | null>
  /** Every project in the app. Used by the scheduled task to find the due and the stalled ones. */
  listProjects(): Promise<ProjectRecord[]>
  updateProject(projectId: string, changes: Partial<ProjectScanFields>): Promise<void>
  getVerdict(key: string): Promise<Verdict | null>
  /** Creates or replaces the verdict with this key. */
  putVerdict(verdict: Verdict): Promise<void>
  /** AI calls made app-wide on a UTC day (YYYY-MM-DD). */
  getAiCalls(day: string): Promise<number>
  /** Counts one more AI call on a UTC day. Returns the new total. */
  addAiCall(day: string): Promise<number>
}

/**
 * The records the alert step reads and writes (src/engine/alert.ts). Real:
 * the same record room, through the same class as `RecordStore`.
 */
export interface AlertStore {
  getProject(projectId: string): Promise<ProjectRecord | null>
  getVerdict(key: string): Promise<Verdict | null>
  /**
   * The address a user signs in with, from the platform's own record of the
   * user. Null when there is none on record. This is the only place an
   * email's recipient comes from.
   */
  getUserEmail(userId: string): Promise<string | null>
  /** A project's send log, in any order. */
  listAlerts(projectId: string): Promise<AlertLogEntry[]>
  /** Adds one line to the send log. */
  addAlert(entry: AlertLogEntry): Promise<void>
  /** Replaces the project's list of verdict keys already alerted. */
  setAlertedKeys(projectId: string, alertedKeys: string[]): Promise<void>
}

// ------------------------------------------------------------------- clock

export interface Clock {
  /** Epoch milliseconds. */
  now(): number
}
