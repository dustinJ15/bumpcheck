/**
 * What a public report is. Pure: no I/O, no platform imports.
 *
 * A project row cannot be shown to the public as it is: it carries its
 * owner's user id (the row's owner field), the owner's review and alert
 * state, and the platform sends a reader the whole row, with no way to
 * leave columns out. So a public project gets a second row, the public
 * report, that holds only what the public page shows. `publicReportOf`
 * is the one place that decides what goes into it: it copies the fields
 * named here and nothing else, so a column added to projects later stays
 * private unless it is added here on purpose.
 *
 * Writing and removing that row is server code: src/server/public-report.ts.
 */

import type { DependencyResult, ScanStatus } from './model'

/** A project is private until its owner says otherwise (story 48). */
export type Visibility = 'private' | 'public'

/** The request value for the visibility action: exactly "private" or "public", else null. */
export function readVisibility(value: unknown): Visibility | null {
  return value === 'private' || value === 'public' ? value : null
}

/** Everything a public report holds. No user id, no review state, no alert state. */
export interface PublicReport {
  /** The project it is a copy of. Also the row's id, and the last part of the share link. */
  projectId: string
  repoOwner: string
  repoName: string
  dependencies: DependencyResult[]
  scanStatus: ScanStatus
  /** ISO time the last full scan finished. Null before the first one. */
  lastScanAt: string | null
}

/** The columns of the `publicReports` collection: the fields above, in order. */
export const PUBLIC_REPORT_COLUMNS = ['projectId', 'repoOwner', 'repoName', 'dependencies', 'scanStatus', 'lastScanAt'] as const

/** The public copy of a project: the named fields, and nothing else the project row holds. */
export function publicReportOf(project: {
  id: string
  repoOwner: string
  repoName: string
  dependencies: DependencyResult[]
  scanStatus: ScanStatus
  lastScanAt: string | null
}): PublicReport {
  return {
    projectId: project.id,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    dependencies: project.dependencies,
    scanStatus: project.scanStatus,
    lastScanAt: project.lastScanAt,
  }
}

/** The path of a project's public report. The settings page shows it as the shareable link. */
export function shareLinkPath(projectId: string): string {
  return `/share/${encodeURIComponent(projectId)}`
}
