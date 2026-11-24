/**
 * Keeping a project's public report in step with the project. Server code only.
 *
 * A public project has one row in `publicReports`, with the project's id as
 * its id (src/schemas/public-reports-schema.ts says why it is a separate
 * row). `syncPublicReport` is the only function that writes or removes it.
 * It reads the project and makes the public report match:
 *
 *   project is public            -> write the report (create it, or replace its contents)
 *   project is private or gone   -> remove the report, if there is one
 *
 * It is called whenever either side may have changed:
 *   - by the visibility action, after it has written the owner's choice
 *     (src/actions/visibility.ts);
 *   - by the scan job, each time a scan or a check ends (src/jobs.ts), so
 *     the public report shows the latest results.
 *
 * Because it always starts from the project row, the two callers cannot
 * disagree about what is public. One case needs care: the owner switches to
 * private at the moment a finishing scan is writing the report. So after
 * writing, the project is read once more, and the report is taken back if
 * the project is no longer public.
 *
 * `tools` must be the app owner's record tools (`ownerActionTools`), not the
 * caller's: a row's `createdBy` is whoever wrote it, readers receive it,
 * and it must not be the project owner's user id.
 */

import type { ActionTools } from 'deepspace/worker'
import type { ScanStatus, DependencyResult } from '../core/model'
import { publicReportOf, type PublicReport } from '../core/public-report'
import { readJson } from '../lib/json'

export const PUBLIC_REPORTS = 'publicReports'

/** The record tools this file needs. */
export type ReportTools = Pick<ActionTools, 'get' | 'create' | 'update' | 'remove'>

export type SyncResult =
  /** The public report now matches the project. `published` says whether there is one. */
  | { ok: true; published: boolean }
  /** A read or write failed. The report may not match the project; the caller decides what to do. */
  | { ok: false; error: string }

/** What the record tools answer for a row that is not there. */
const NOT_FOUND = 'Record not found'

export async function syncPublicReport(tools: ReportTools, projectId: string): Promise<SyncResult> {
  const before = await readPublicProject(tools, projectId)
  if (!before.ok) return before
  if (before.report === null) return removeReport(tools, projectId)

  const written = await writeReport(tools, projectId, before.report)
  if (!written.ok) return written

  // Check again after writing: if the owner switched to private in between,
  // their removal may have run before this write, and the report must go.
  const after = await readPublicProject(tools, projectId)
  if (after.ok && after.report !== null) return { ok: true, published: true }
  const removed = await removeReport(tools, projectId)
  return after.ok ? removed : after
}

/**
 * Writes a public report under an id, replacing what is there. Exported for
 * the test-only example fixture (src/actions/test-reset.ts); everything else
 * goes through `syncPublicReport`.
 */
export async function writeReport(tools: ReportTools, reportId: string, report: PublicReport): Promise<SyncResult> {
  const existing = await tools.get(PUBLIC_REPORTS, reportId)
  if (existing.success) {
    // `projectId` is fixed once written, so an update leaves it out.
    const { projectId: _fixed, ...contents } = report
    const updated = await tools.update(PUBLIC_REPORTS, reportId, contents)
    return updated.success ? { ok: true, published: true } : { ok: false, error: updated.error }
  }
  if (!existing.error.startsWith(NOT_FOUND)) return { ok: false, error: existing.error }

  const created = await tools.create(PUBLIC_REPORTS, { ...report }, reportId)
  return created.success ? { ok: true, published: true } : { ok: false, error: created.error }
}

/** Removes a public report. Removing one that is not there counts as done. */
export async function removeReport(tools: ReportTools, reportId: string): Promise<SyncResult> {
  const removed = await tools.remove(PUBLIC_REPORTS, reportId)
  if (removed.success || removed.error.startsWith(NOT_FOUND)) return { ok: true, published: false }
  return { ok: false, error: removed.error }
}

/**
 * The public report a project should have right now: null when the project
 * is private or does not exist. This is the one place that reads the
 * owner's `visibility` setting to decide what the public may see.
 */
async function readPublicProject(
  tools: ReportTools,
  projectId: string,
): Promise<{ ok: true; report: PublicReport | null } | { ok: false; error: string }> {
  const found = await tools.get('projects', projectId)
  if (!found.success) {
    return found.error.startsWith(NOT_FOUND) ? { ok: true, report: null } : { ok: false, error: found.error }
  }
  const data = found.data.record.data
  if (data.visibility !== 'public') return { ok: true, report: null }

  return {
    ok: true,
    report: publicReportOf({
      id: projectId,
      repoOwner: String(data.repoOwner),
      repoName: String(data.repoName),
      dependencies: readJson<DependencyResult[]>(data.dependencies) ?? [],
      scanStatus: (typeof data.scanStatus === 'string' ? data.scanStatus : 'idle') as ScanStatus,
      lastScanAt: typeof data.lastScanAt === 'string' && data.lastScanAt !== '' ? data.lastScanAt : null,
    }),
  }
}
