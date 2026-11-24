/**
 * Project page: one project's report, for its owner.
 *
 * What it shows is decided by pure code, not here: `buildReport`
 * (src/core/report.ts) sorts the dependencies into groups and sections and
 * splits off the reviewed ones. This file loads the rows, draws the page
 * around the report, and sends button presses to server actions.
 *
 * Reads are live subscriptions, so scan progress, new verdicts and a change
 * made in another tab all appear without a reload:
 *   - the user's own project rows (the scan job writes its progress there,
 *     because users cannot watch the job room);
 *   - the shared verdicts.
 *
 * Only the owner sees this page. The project is looked for among the
 * caller's own rows (src/components/report/OwnProject.tsx), so someone
 * else's project id, or a deleted one, finds nothing and gets the "not
 * available" panel. The record room enforces the same thing on its side: it
 * never sends a project row to anyone but its owner
 * (src/schemas/projects-schema.ts). The read-only public view is a separate
 * page, src/pages/(app)/share/[id].tsx, which draws the same report
 * (src/components/report/ReportBody.tsx) with no actions.
 *
 * Writes are not done here. Every button calls a server action, which checks
 * the caller and ownership first (src/actions/). "Scan now" is one of them:
 * the server decides whether a scan may start, and the page shows its answer
 * (src/components/report/ScanNotices.tsx has the notices).
 */

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUser, type RecordData } from 'deepspace'
import type { RowAction } from '@/components/report/DependencyRow'
import { OwnProject } from '@/components/report/OwnProject'
import { ErrorPanel, Panel } from '@/components/report/Panels'
import { ReportBody } from '@/components/report/ReportBody'
import { ScanNotices } from '@/components/report/ScanNotices'
import { ScanStatusLine } from '@/components/report/ScanStatus'
import { Button } from '@/components/ui'
import type { DependencyResult, ScanProgress } from '@/core/model'
import { callAction } from '@/lib/actions'
import { readJson } from '@/lib/json'
import { useVerdicts, type ProjectRow } from '@/lib/records'

export default function ProjectPage() {
  const { id } = useParams()
  const { user } = useUser()

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Link to="/projects" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          ← Projects
        </Link>
        {user && id ? (
          <OwnProject projectId={id} userId={user.id}>
            {(record) => <ProjectView record={record} />}
          </OwnProject>
        ) : (
          <Panel>Loading the project...</Panel>
        )}
      </div>
    </div>
  )
}

function ProjectView(props: { record: RecordData<ProjectRow> }) {
  const verdicts = useVerdicts()
  const projectId = props.record.recordId
  const project = props.record.data
  const name = `${project.repoOwner}/${project.repoName}`
  const dependencies = readJson<DependencyResult[]>(project.dependencies) ?? []
  const reviewedKeys = readJson<string[]>(project.reviewedKeys) ?? []
  const checkRequests = readJson<string[]>(project.checkRequests) ?? []
  const scanRunning = project.scanStatus === 'queued' || project.scanStatus === 'scanning'
  const [actionError, setActionError] = useState<string | null>(null)
  const [startingScan, setStartingScan] = useState(false)
  // When the server last refused "scan now" for its cooldown: the time it said the button returns.
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)

  // Tell the server the owner opened the project: it resets the idle timer
  // that pauses daily scans (story 30). Once per visit.
  useEffect(() => {
    void callAction('record-opened', { projectId })
  }, [projectId])

  async function runAction(action: RowAction, params: { packageName: string; verdictKey?: string }) {
    setActionError(null)
    const answer = await callAction(action, { projectId, ...params })
    if (!answer.success) setActionError(answer.error)
    // On success there is nothing to do: the changed row arrives through the live query.
  }

  /** "Scan now", and Retry on a failed scan. The server applies the cooldown and the one-scan-at-a-time rule. */
  async function scanNow() {
    setActionError(null)
    setStartingScan(true)
    const answer = await callAction('scan-now', { projectId })
    setStartingScan(false)
    // A cooldown refusal has its own notice, with the time the server gave; anything else is shown as it came.
    const availableAt = !answer.success && answer.code === 'cooling-down' ? answer.details?.availableAt : undefined
    setCooldownUntil(typeof availableAt === 'number' ? availableAt : null)
    if (!answer.success && typeof availableAt !== 'number') setActionError(answer.error)
  }

  return (
    <div
      data-testid="project-page"
      data-scan-status={project.scanStatus}
      data-last-scan-at={project.lastScanAt ?? undefined}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h1 className="break-all font-mono text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <ScanStatusLine project={project} />
          <div className="flex shrink-0 items-center gap-3">
            <a
              href={`https://github.com/${name}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              View on GitHub
            </a>
            <Link
              to={`/projects/${projectId}/settings`}
              data-testid="project-settings-link"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Settings
            </Link>
            <Button size="sm" variant="outline" loading={startingScan} disabled={scanRunning} onClick={scanNow}>
              Scan now
            </Button>
          </div>
        </div>
      </header>

      {scanRunning && <ScanProgressPanel progress={readJson<ScanProgress>(project.scanProgress)} />}

      <ScanNotices
        project={project}
        dependencies={dependencies}
        cooldownUntil={cooldownUntil}
        starting={startingScan}
        onScanNow={scanNow}
      />

      {/* A check or retry that could not finish. The last full scan still stands, so the status is "done". */}
      {project.scanStatus === 'done' && project.scanError && (
        <div data-testid="check-failed-notice">
          <ErrorPanel title="The last check did not finish">
            {project.scanError} The report below is unchanged.
          </ErrorPanel>
        </div>
      )}

      {actionError && (
        <div data-testid="action-error">
          <ErrorPanel title="That did not work">{actionError}</ErrorPanel>
        </div>
      )}

      <ReportBody
        scanStatus={project.scanStatus}
        dependencies={dependencies}
        reviewedKeys={reviewedKeys}
        checkRequests={checkRequests}
        verdicts={verdicts}
        scanRunning={scanRunning}
        onAction={runAction}
      />
    </div>
  )
}

/** Live progress of the running scan, as the job last wrote it to the project row (story 23). */
function ScanProgressPanel({ progress }: { progress: ScanProgress | null }) {
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div data-testid="scan-progress" role="status" className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <span aria-hidden className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="min-w-0 break-words">{progress?.message ?? 'Waiting for the scan to start'}</span>
        {progress && progress.total > 1 && (
          <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
            {progress.done}/{progress.total}
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
