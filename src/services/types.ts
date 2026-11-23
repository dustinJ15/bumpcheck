/**
 * The outside world, as interfaces.
 *
 * The scan engine talks only to these. Production passes real
 * implementations (tickets 02 and 06); tests and the local test server pass
 * the fakes in ./fakes.ts. Which set the worker uses is decided in ./wire.ts. This file is the one seam the spec allows
 * ("Testing Decisions"), so it imports nothing from `deepspace`.
 */

import type { ReleaseNote } from '../core/changelog'
import type { ProjectScanFields, RepoRef, SourceRepo, Verdict } from '../core/model'
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
  /** A package's GitHub release notes. Null when there are none or the request is refused. */
  getReleases(source: SourceRepo): Promise<ReleaseList | null>
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
}

export type MailResult = { ok: true } | { ok: false; error: string }

/** Sends one composed message. Real: the email integration (ticket 06). */
export interface Mailer {
  send(message: MailMessage): Promise<MailResult>
}

// ------------------------------------------------------------ record store

/** A project as the scan engine sees it. */
export interface ProjectRecord extends ProjectScanFields {
  id: string
  /** The user who owns the project (the schema's owner field). */
  userId: string
}

/**
 * The app's records, in the terms the engine needs. Real: the platform's
 * record room, reached with owner context from a job.
 */
export interface RecordStore {
  getProject(projectId: string): Promise<ProjectRecord | null>
  updateProject(projectId: string, changes: Partial<ProjectScanFields>): Promise<void>
  getVerdict(key: string): Promise<Verdict | null>
  /** Creates or replaces the verdict with this key. */
  putVerdict(verdict: Verdict): Promise<void>
  /** AI calls made app-wide on a UTC day (YYYY-MM-DD). */
  getAiCalls(day: string): Promise<number>
  /** Counts one more AI call on a UTC day. Returns the new total. */
  addAiCall(day: string): Promise<number>
}

// ------------------------------------------------------------------- clock

export interface Clock {
  /** Epoch milliseconds. */
  now(): number
}
