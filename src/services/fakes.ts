/**
 * Fakes for every outside-world interface in ./types.ts.
 *
 * Deterministic (no randomness, no real time, no network) and each one
 * records its calls, so a test can say "no judge call was made". Used by
 * the engine tests now, and by the local test server when the fake-services
 * setting is on (see ./mode.ts).
 */

import type { AlertLogEntry, ProjectScanFields, RepoRef, SourceRepo, Verdict } from '../core/model'
import { validateVerdictResponse, type VerdictPromptInput } from '../core/verdict'
import type {
  AlertStore,
  ChangelogFile,
  Clock,
  Judge,
  JudgeResult,
  MailMessage,
  Mailer,
  MailResult,
  PackageRegistry,
  ProjectRecord,
  RecordStore,
  RegistryPackage,
  ReleaseList,
  ReleasesAnswer,
  RepoInfo,
  SourceHost,
} from './types'

// ---------------------------------------------------------------- registry

export class FakeRegistry implements PackageRegistry {
  /** Every package name asked for, in order. */
  readonly calls: string[] = []

  constructor(private readonly packages: Record<string, RegistryPackage> = {}) {}

  async getPackage(name: string): Promise<RegistryPackage | null> {
    this.calls.push(name)
    return this.packages[name] ?? null
  }
}

// ------------------------------------------------------------- source host

export interface FakeRepo {
  defaultBranch: string
  /** File path -> text, on the default branch. */
  files: Record<string, string>
}

export interface FakeSourceHostData {
  /** "owner/repo" -> repo. A repo missing here is "not found or private". */
  repos?: Record<string, FakeRepo>
  /** Source key ("owner/repo" or "owner/repo/directory") -> CHANGELOG.md text. */
  changelogs?: Record<string, string>
  /** Source key -> release notes. */
  releases?: Record<string, ReleaseList['releases']>
  /** Source keys whose release notes GitHub "refuses" to serve (a rate limit, say). */
  refusedReleases?: string[]
}

export type SourceHostCall =
  | { method: 'getRepo'; repo: string }
  | { method: 'getFile'; repo: string; path: string; ref: string }
  | { method: 'getChangelog'; source: string }
  | { method: 'getReleases'; source: string }

export class FakeSourceHost implements SourceHost {
  readonly calls: SourceHostCall[] = []

  /** Public so a test can change the world between scans. */
  constructor(readonly data: FakeSourceHostData = {}) {}

  async getRepo(repo: RepoRef): Promise<RepoInfo | null> {
    const name = `${repo.owner}/${repo.repo}`
    this.calls.push({ method: 'getRepo', repo: name })
    const found = this.data.repos?.[name]
    return found ? { defaultBranch: found.defaultBranch } : null
  }

  async getFile(repo: RepoRef, path: string, ref: string): Promise<string | null> {
    const name = `${repo.owner}/${repo.repo}`
    this.calls.push({ method: 'getFile', repo: name, path, ref })
    const found = this.data.repos?.[name]
    if (!found || found.defaultBranch !== ref) return null
    return found.files[path] ?? null
  }

  async getChangelog(source: SourceRepo): Promise<ChangelogFile | null> {
    const key = sourceKey(source)
    this.calls.push({ method: 'getChangelog', source: key })
    const text = this.data.changelogs?.[key]
    if (text === undefined) return null
    const folder = source.directory ? `${source.directory}/` : ''
    return { text, url: `https://github.com/${source.owner}/${source.repo}/blob/HEAD/${folder}CHANGELOG.md` }
  }

  async getReleases(source: SourceRepo): Promise<ReleasesAnswer> {
    const key = sourceKey(source)
    this.calls.push({ method: 'getReleases', source: key })
    if (this.data.refusedReleases?.includes(key)) return { status: 'refused' }
    const releases = this.data.releases?.[key]
    if (releases === undefined) return { status: 'none' }
    return { status: 'found', releases, url: `https://github.com/${source.owner}/${source.repo}/releases` }
  }
}

/** "owner/repo", or "owner/repo/directory" for a monorepo package. */
export function sourceKey(source: SourceRepo): string {
  const base = `${source.owner}/${source.repo}`
  return source.directory ? `${base}/${source.directory}` : base
}

// ------------------------------------------------------------------- judge

/**
 * Decides what the fake model "says" for a call. Return any raw response
 * (an object or text); it goes through the real verdict validator, exactly
 * as a real model response would. `attempt` counts calls for that package,
 * starting at 1.
 */
export type FakeJudgeResponder = (input: VerdictPromptInput, attempt: number) => unknown

/** A good, deterministic verdict: breaking, naming the package. */
export const defaultFakeResponder: FakeJudgeResponder = (input) => ({
  label: 'breaking',
  summary: `${input.packageName} ${input.toVersion} has breaking changes (fake judge).`,
  changes: [
    {
      title: `${input.packageName} changed its main export`,
      whatChanged: 'The default export was renamed (fake judge).',
      apiNames: ['default'],
      whatToDo: 'Update the import (fake judge).',
    },
  ],
})

export class FakeJudge implements Judge {
  /** Every judge call, in order. An empty list means no AI was spent. */
  readonly calls: VerdictPromptInput[] = []

  constructor(private readonly respond: FakeJudgeResponder = defaultFakeResponder) {}

  async judge(input: VerdictPromptInput): Promise<JudgeResult> {
    this.calls.push(input)
    const attempt = this.calls.filter((c) => c.packageName === input.packageName).length
    return validateVerdictResponse(this.respond(input, attempt))
  }
}

// ------------------------------------------------------------------ mailer

/**
 * Decides what the fake mail service "answers" for a message. `attempt`
 * counts every message handed to the mailer, starting at 1. May throw.
 */
export type FakeMailResponder = (message: MailMessage, attempt: number) => MailResult

export class FakeMailer implements Mailer {
  /** Every message handed to the mailer, sent or not. An empty list means no email went out. */
  readonly calls: MailMessage[] = []

  /** Pass a result to give the same answer every time, or a function to decide per message. */
  constructor(private readonly respond: MailResult | FakeMailResponder = { ok: true }) {}

  async send(message: MailMessage): Promise<MailResult> {
    this.calls.push(structuredClone(message))
    return typeof this.respond === 'function' ? this.respond(message, this.calls.length) : this.respond
  }
}

// ------------------------------------------------------------ record store

export type RecordStoreCall =
  | { method: 'getProject' | 'listProjects' | 'getVerdict' | 'getAiCalls' | 'addAiCall'; arg: string }
  | { method: 'getUserEmail' | 'listAlerts' | 'addAlert' | 'setAlertedKeys'; arg: string }
  | { method: 'updateProject'; arg: string; changes: Partial<ProjectScanFields> }
  | { method: 'putVerdict'; arg: string }

/** An in-memory record store. Values are copied in and out, like a real database. */
export class MemoryRecordStore implements RecordStore, AlertStore {
  readonly calls: RecordStoreCall[] = []
  readonly projects = new Map<string, ProjectRecord>()
  readonly verdicts = new Map<string, Verdict>()
  readonly aiCalls = new Map<string, number>()
  /** User id -> the address that user signs in with. */
  readonly userEmails = new Map<string, string>()
  /** The send log of every project, oldest first. */
  readonly alerts: AlertLogEntry[] = []
  /** Alert-store methods that should throw, so a test can see what a failed read or write leads to. */
  readonly failing = new Set<'listAlerts' | 'addAlert' | 'setAlertedKeys'>()

  /** Adds a project with sensible empty scan fields; `fields` overrides any of them. */
  seedProject(fields: Pick<ProjectRecord, 'id' | 'userId' | 'repoOwner' | 'repoName'> & Partial<ProjectRecord>): void {
    this.projects.set(fields.id, copy({
      defaultBranch: null,
      dependencies: [],
      scanStatus: 'queued',
      scanProgress: null,
      scanReport: null,
      scanError: null,
      lastScanAt: null,
      nextDueAt: null,
      scanHeartbeatAt: null,
      lastOpenedAt: null,
      checkRequests: [],
      reviewedKeys: [],
      alertsEnabled: false,
      alertedKeys: [],
      ...fields,
    }))
  }

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    this.calls.push({ method: 'getProject', arg: projectId })
    const project = this.projects.get(projectId)
    return project ? copy(project) : null
  }

  async listProjects(): Promise<ProjectRecord[]> {
    this.calls.push({ method: 'listProjects', arg: '' })
    return [...this.projects.values()].map(copy)
  }

  async updateProject(projectId: string, changes: Partial<ProjectScanFields>): Promise<void> {
    this.calls.push({ method: 'updateProject', arg: projectId, changes: copy(changes) })
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`no project ${projectId}`)
    this.projects.set(projectId, { ...project, ...copy(changes) })
  }

  async getVerdict(key: string): Promise<Verdict | null> {
    this.calls.push({ method: 'getVerdict', arg: key })
    const verdict = this.verdicts.get(key)
    return verdict ? copy(verdict) : null
  }

  async putVerdict(verdict: Verdict): Promise<void> {
    this.calls.push({ method: 'putVerdict', arg: verdict.key })
    this.verdicts.set(verdict.key, copy(verdict))
  }

  async getAiCalls(day: string): Promise<number> {
    this.calls.push({ method: 'getAiCalls', arg: day })
    return this.aiCalls.get(day) ?? 0
  }

  async addAiCall(day: string): Promise<number> {
    this.calls.push({ method: 'addAiCall', arg: day })
    const next = (this.aiCalls.get(day) ?? 0) + 1
    this.aiCalls.set(day, next)
    return next
  }

  async getUserEmail(userId: string): Promise<string | null> {
    this.calls.push({ method: 'getUserEmail', arg: userId })
    return this.userEmails.get(userId) ?? null
  }

  async listAlerts(projectId: string): Promise<AlertLogEntry[]> {
    this.calls.push({ method: 'listAlerts', arg: projectId })
    if (this.failing.has('listAlerts')) throw new Error('could not read the send log (fake)')
    return this.alerts.filter((entry) => entry.projectId === projectId).map(copy)
  }

  async addAlert(entry: AlertLogEntry): Promise<void> {
    this.calls.push({ method: 'addAlert', arg: entry.projectId })
    if (this.failing.has('addAlert')) throw new Error('could not write the send log (fake)')
    this.alerts.push(copy(entry))
  }

  async setAlertedKeys(projectId: string, alertedKeys: string[]): Promise<void> {
    this.calls.push({ method: 'setAlertedKeys', arg: projectId })
    if (this.failing.has('setAlertedKeys')) throw new Error('could not update the project (fake)')
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`no project ${projectId}`)
    this.projects.set(projectId, { ...project, alertedKeys: copy(alertedKeys) })
  }
}

// ------------------------------------------------------------------- clock

export class FakeClock implements Clock {
  constructor(private time: number = Date.parse('2026-11-23T12:00:00.000Z')) {}

  now(): number {
    return this.time
  }

  advance(ms: number): void {
    this.time += ms
  }
}

function copy<T>(value: T): T {
  return structuredClone(value)
}
