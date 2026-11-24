/**
 * The real record store: the app's record room, reached through the
 * platform's server-side record tools.
 *
 * Those tools skip role checks (src/server/action-routes.ts explains the
 * trust model), which is what lets server code write collections whose
 * schemas deny every client write. Used with the fake services too: in a
 * browser test the records are real (the local record room) and only the
 * outside services are faked.
 *
 * `getAiCalls` then `addAiCall` is read-then-write, not atomic. That is safe
 * only because every scan runs in the one job room, and jobs in a room run
 * one at a time.
 */

import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { ProjectScanFields, Verdict } from '../core/model'
import type { Clock, ProjectRecord, RecordStore } from './types'

type RecordTools = Pick<ActionTools, 'get' | 'query' | 'create' | 'update'>

export class RecordRoomStore implements RecordStore {
  constructor(private readonly tools: RecordTools) {}

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    const result = await this.tools.get('projects', projectId)
    if (!result.success) {
      if (result.error.startsWith('Record not found')) return null
      throw new Error(`could not read project ${projectId}: ${result.error}`)
    }
    return toProjectRecord(projectId, result.data.record.data)
  }

  /**
   * Every project row. No `limit` is passed, and server-side queries
   * without one return every row. Fine at this app's size (a handful of
   * projects per user); a much larger app would page through them.
   */
  async listProjects(): Promise<ProjectRecord[]> {
    const result = unwrap(await this.tools.query('projects'), 'list projects')
    return result.records.map((record) => toProjectRecord(record.recordId, record.data))
  }

  async updateProject(projectId: string, changes: Partial<ProjectScanFields>): Promise<void> {
    unwrap(await this.tools.update('projects', projectId, changes), `update project ${projectId}`)
  }

  async getVerdict(key: string): Promise<Verdict | null> {
    const row = await this.findOne('verdicts', { key })
    if (row === null) return null
    const data = row.data
    return {
      key,
      packageName: String(data.packageName),
      status: String(data.status) as Verdict['status'],
      label: (text(data.label) ?? undefined) as Verdict['label'],
      summary: text(data.summary) ?? undefined,
      changes: json(data.changes, []),
      sourceUrl: text(data.sourceUrl),
      inputTruncated: data.inputTruncated === true || data.inputTruncated === 1,
      fromVersion: String(data.fromVersion),
      toVersion: String(data.toVersion),
      failureReason: text(data.failureReason) ?? undefined,
      decidedAt: String(data.decidedAt),
    }
  }

  async putVerdict(verdict: Verdict): Promise<void> {
    // Every column is written, with null for the ones this verdict does not
    // have, so replacing a "failed" verdict with a "ready" one leaves no
    // stale failure reason behind.
    const row = {
      key: verdict.key,
      packageName: verdict.packageName,
      status: verdict.status,
      label: verdict.label ?? null,
      summary: verdict.summary ?? null,
      changes: verdict.changes,
      sourceUrl: verdict.sourceUrl,
      inputTruncated: verdict.inputTruncated,
      fromVersion: verdict.fromVersion,
      toVersion: verdict.toVersion,
      failureReason: verdict.failureReason ?? null,
      decidedAt: verdict.decidedAt,
    }
    const existing = await this.findOne('verdicts', { key: verdict.key })
    if (existing === null) {
      unwrap(await this.tools.create('verdicts', row), `create verdict ${verdict.key}`)
    } else {
      // `key` is immutable, so it is left out of the update.
      const { key: _key, ...changes } = row
      unwrap(await this.tools.update('verdicts', existing.recordId, changes), `update verdict ${verdict.key}`)
    }
  }

  async getAiCalls(day: string): Promise<number> {
    const row = await this.findOne('usage', { day })
    return row === null ? 0 : Number(row.data.aiCalls ?? 0)
  }

  async addAiCall(day: string): Promise<number> {
    const row = await this.findOne('usage', { day })
    if (row === null) {
      unwrap(await this.tools.create('usage', { day, aiCalls: 1 }), `create usage row ${day}`)
      return 1
    }
    const next = Number(row.data.aiCalls ?? 0) + 1
    unwrap(await this.tools.update('usage', row.recordId, { aiCalls: next }), `update usage row ${day}`)
    return next
  }

  private async findOne(
    collection: string,
    where: Record<string, unknown>,
  ): Promise<{ recordId: string; data: Record<string, unknown> } | null> {
    const result = unwrap(await this.tools.query(collection, { where, limit: 1 }), `query ${collection}`)
    return result.records[0] ?? null
  }
}

function toProjectRecord(projectId: string, data: Record<string, unknown>): ProjectRecord {
  return {
    id: projectId,
    userId: String(data.userId),
    repoOwner: String(data.repoOwner),
    repoName: String(data.repoName),
    defaultBranch: text(data.defaultBranch),
    dependencies: json(data.dependencies, []),
    scanStatus: (text(data.scanStatus) ?? 'idle') as ProjectRecord['scanStatus'],
    scanProgress: json(data.scanProgress, null),
    scanReport: json(data.scanReport, null),
    scanError: text(data.scanError),
    lastScanAt: text(data.lastScanAt),
    nextDueAt: text(data.nextDueAt),
    scanHeartbeatAt: text(data.scanHeartbeatAt),
    lastOpenedAt: text(data.lastOpenedAt),
    checkRequests: json(data.checkRequests, []),
  }
}

export const systemClock: Clock = { now: () => Date.now() }

function unwrap<T>(result: ActionResult<T>, what: string): T {
  if (!result.success) throw new Error(`could not ${what}: ${result.error}`)
  return result.data
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** A JSON column, whether the record room hands it back parsed or as text. */
function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
