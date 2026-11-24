/**
 * The record rows the pages read, and the hook that loads verdicts.
 *
 * Pages only read. A `useQuery` here is a live subscription: when server
 * code changes a row, every open tab gets the new row (story 36). All writes
 * go through server actions (src/lib/actions.ts).
 */

import { useMemo } from 'react'
import { useQuery } from 'deepspace'
import type { DependencyResult, ScanProgress, ScanStatus, Verdict, VerdictChange } from '@/core/model'
import type { Visibility } from '@/core/public-report'
import type { VerdictsByKey } from '@/core/report'
import { readJson } from './json'

/**
 * The columns of a project row the pages read. JSON columns may arrive
 * parsed or as text, so read them with `readJson`.
 */
export interface ProjectRow {
  userId: string
  /** The owner's sharing choice. A public project has a copy in `publicReports`. */
  visibility: Visibility | null
  repoOwner: string
  repoName: string
  scanStatus: ScanStatus
  scanProgress: ScanProgress | string | null
  scanError: string | null
  lastScanAt: string | null
  /** When the next daily scan is due, and when the user last asked for a scan (the cooldown counts from it). */
  nextDueAt: string | null
  lastScanRequestedAt: string | null
  dependencies: DependencyResult[] | string | null
  reviewedKeys: string[] | string | null
  checkRequests: string[] | string | null
}

/**
 * A public report row (src/schemas/public-reports-schema.ts): what anyone
 * with the link reads. It has no owner, no review state and no alert state.
 */
export interface PublicReportRow {
  projectId: string
  repoOwner: string
  repoName: string
  scanStatus: ScanStatus
  lastScanAt: string | null
  dependencies: DependencyResult[] | string | null
}

/** A verdict row as stored (src/schemas/verdicts-schema.ts). */
interface VerdictRow {
  key: string
  packageName: string
  status: Verdict['status']
  label: Verdict['label'] | null
  summary: string | null
  changes: VerdictChange[] | string | null
  sourceUrl: string | null
  inputTruncated: boolean | number | null
  fromVersion: string
  toVersion: string
  failureReason: string | null
  decidedAt: string
}

function toVerdict(row: VerdictRow): Verdict {
  return {
    key: row.key,
    packageName: row.packageName,
    status: row.status,
    label: row.label ?? undefined,
    summary: row.summary ?? undefined,
    changes: readJson<VerdictChange[]>(row.changes) ?? [],
    sourceUrl: row.sourceUrl || null,
    inputTruncated: row.inputTruncated === true || row.inputTruncated === 1,
    fromVersion: row.fromVersion,
    toVersion: row.toVersion,
    failureReason: row.failureReason ?? undefined,
    decidedAt: row.decidedAt,
  }
}

/**
 * The shared verdict cache, by key, kept live.
 *
 * This subscribes to the whole `verdicts` collection: the record room's
 * queries filter by equality only, so there is no "these keys" query, and
 * the report needs every verdict of a project at once to sort it. The
 * collection is small by design (at most `LIMITS.aiCallsPerDay` new rows a
 * day, and every row is public package information).
 */
export function useVerdicts(): { verdicts: VerdictsByKey; status: 'loading' | 'ready' | 'error'; error?: string } {
  const { records, status, error } = useQuery<VerdictRow>('verdicts')
  const verdicts = useMemo(() => new Map(records.map((record) => [record.data.key, toVerdict(record.data)])), [records])
  return { verdicts, status, error }
}

/** A time for people: "Nov 23, 2026, 2:05 PM". Empty for a missing or bad value. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? '' : time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
