/**
 * Project page: one project's report, for its owner.
 *
 * What it shows is decided by pure code, not here: `buildReport`
 * (src/core/report.ts) sorts the dependencies into groups and sections and
 * splits off the reviewed ones. This file loads the rows, draws the result,
 * and sends button presses to server actions.
 *
 * Reads are live subscriptions, so scan progress, new verdicts and a change
 * made in another tab all appear without a reload:
 *   - the user's own project rows (the scan job writes its progress there,
 *     because users cannot watch the job room);
 *   - the shared verdicts.
 *
 * Only the owner sees this page. The project is looked for among the
 * caller's own rows, so someone else's project id (or a deleted one) finds
 * nothing and gets the "not available" panel. The record room enforces the
 * same thing on its side: it never sends a private row to anyone but its
 * owner (src/schemas/projects-schema.ts). The read-only public view is a
 * separate page (ticket 05).
 *
 * Writes are not done here. Every button calls a server action, which checks
 * the caller and ownership first (src/actions/).
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useUser, type RecordData } from 'deepspace'
import { DependencyRow, type RowAction } from '@/components/report/DependencyRow'
import { ScanStatusLine } from '@/components/report/ScanStatus'
import type { DependencyGroup, DependencyResult, ScanProgress } from '@/core/model'
import { buildReport, type Report, type ReportRow, type SectionId, type VerdictsByKey } from '@/core/report'
import { callAction } from '@/lib/actions'
import { readJson } from '@/lib/json'
import { useVerdicts, type ProjectRow } from '@/lib/records'

const GROUP_TITLE: Record<DependencyGroup, string> = {
  runtime: 'Runtime dependencies',
  dev: 'Dev dependencies',
}

const SECTION_TITLE: Record<SectionId, string> = {
  breaking: 'Breaking',
  unclear: 'Unclear',
  'safe-major': 'Safe major',
  'minor-patch': 'Minor or patch',
  'up-to-date': 'Up to date',
  'not-checked': 'Not checked',
}

export default function ProjectPage() {
  const { id } = useParams()
  const { user } = useUser()

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Link to="/projects" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          ← Projects
        </Link>
        {user && id ? <ProjectLoader projectId={id} userId={user.id} /> : <Panel>Loading the project...</Panel>}
      </div>
    </div>
  )
}

/** Finds the project among the caller's own rows, or says why there is nothing to show. */
function ProjectLoader({ projectId, userId }: { projectId: string; userId: string }) {
  // `where` matters twice: it keeps this to the caller's own projects (the
  // read rule also allows other people's public ones), and the list is live.
  const projects = useQuery<ProjectRow>('projects', { where: { userId } })
  const verdicts = useVerdicts()

  if (projects.status === 'loading') return <Panel>Loading the project...</Panel>
  if (projects.status === 'error') {
    return <ErrorPanel title="Could not load the project">{projects.error ?? 'Reload the page to try again.'}</ErrorPanel>
  }

  const record = projects.records.find((r) => r.recordId === projectId)
  if (!record) return <NotAvailable />

  return <ProjectView record={record} verdicts={verdicts} />
}

/** For a project id that is not one of the caller's: someone else's, deleted, or mistyped. */
function NotAvailable() {
  return (
    <div data-testid="project-not-available" className="rounded-lg border border-border bg-card px-6 py-12 text-center">
      <h1 className="text-lg font-semibold">This project is not available</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        It may be private and belong to someone else, or it may have been deleted. Check the link, or ask its owner to
        share it.
      </p>
      <Link to="/projects" className="mt-6 inline-block text-sm font-medium text-primary underline underline-offset-4">
        Back to your projects
      </Link>
    </div>
  )
}

function ProjectView(props: { record: RecordData<ProjectRow>; verdicts: ReturnType<typeof useVerdicts> }) {
  const projectId = props.record.recordId
  const project = props.record.data
  const name = `${project.repoOwner}/${project.repoName}`
  const dependencies = readJson<DependencyResult[]>(project.dependencies) ?? []
  const reviewedKeys = readJson<string[]>(project.reviewedKeys) ?? []
  const checkRequests = readJson<string[]>(project.checkRequests) ?? []
  const scanRunning = project.scanStatus === 'queued' || project.scanStatus === 'scanning'
  const [actionError, setActionError] = useState<string | null>(null)

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

  return (
    <div data-testid="project-page" data-scan-status={project.scanStatus} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="break-all font-mono text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <ScanStatusLine project={project} />
          <a
            href={`https://github.com/${name}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View on GitHub
          </a>
        </div>
      </header>

      {scanRunning && <ScanProgressPanel progress={readJson<ScanProgress>(project.scanProgress)} />}

      {project.scanStatus === 'failed' && (
        <ErrorPanel title="The last scan failed">
          {project.scanError ?? 'Unknown reason.'}
          {dependencies.length > 0 && ' The results below are from the last scan that finished.'}
        </ErrorPanel>
      )}

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
        project={project}
        dependencies={dependencies}
        reviewedKeys={reviewedKeys}
        checkRequests={checkRequests}
        verdicts={props.verdicts}
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

/** The report itself, or the state that stands in for it: loading, waiting for a first scan, empty. */
function ReportBody(props: {
  project: ProjectRow
  dependencies: DependencyResult[]
  reviewedKeys: string[]
  checkRequests: string[]
  verdicts: ReturnType<typeof useVerdicts>
  scanRunning: boolean
  onAction: (action: RowAction, params: { packageName: string; verdictKey?: string }) => Promise<void>
}) {
  const { project, dependencies, verdicts } = props

  if (dependencies.length === 0) {
    if (props.scanRunning) {
      return (
        <div data-testid="report-waiting">
          <Panel>The report will appear here when the first scan finishes.</Panel>
        </div>
      )
    }
    if (project.scanStatus === 'done') {
      return (
        <div data-testid="report-empty" className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
          <h2 className="text-base font-semibold">No dependencies</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            This repository&apos;s package.json declares no dependencies or devDependencies, so there is nothing to check.
          </p>
        </div>
      )
    }
    return <Panel>No results yet. They will appear after the next scan that finishes.</Panel>
  }

  // The verdicts decide where each dependency is listed, so wait for them
  // rather than draw the report and then move half of it.
  if (verdicts.status === 'loading') return <Panel>Loading verdicts...</Panel>

  // If the verdicts could not be loaded, the report is still drawn from the
  // triage alone, with a notice.
  const loaded: VerdictsByKey = verdicts.status === 'ready' ? verdicts.verdicts : new Map()
  const report = buildReport(dependencies, loaded, props.reviewedKeys)
  const rowProps = { scanRunning: props.scanRunning, checkRequests: props.checkRequests, onAction: props.onAction }

  return (
    <>
      {verdicts.status === 'error' && (
        <ErrorPanel title="Could not load the verdicts">
          The dependencies below are sorted by version only. Reload the page to try again.
        </ErrorPanel>
      )}

      <p data-testid="unreviewed-breaking" className="text-sm">
        {report.unreviewedBreaking === 0 ? (
          <span className="text-muted-foreground">Nothing breaking to review.</span>
        ) : (
          <span className="font-medium">
            {report.unreviewedBreaking} breaking {report.unreviewedBreaking === 1 ? 'upgrade' : 'upgrades'} to review.
          </span>
        )}
      </p>

      {report.groups.map((group) => (
        <section key={group.group} data-testid={`group-${group.group}`} aria-label={GROUP_TITLE[group.group]}>
          <h2 className="flex items-baseline gap-2 text-base font-semibold">
            {GROUP_TITLE[group.group]}
            <span className="font-mono text-xs font-normal text-muted-foreground">{group.count}</span>
          </h2>
          {group.sections.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing to show here.</p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card">
              {group.sections.map((section) => (
                <div key={section.id} data-testid="report-section" data-section={section.id} className="border-b border-border last:border-b-0">
                  <h3 className="flex items-baseline gap-2 bg-secondary/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {SECTION_TITLE[section.id]}
                    <span className="font-mono font-normal">{section.rows.length}</span>
                  </h3>
                  <RowList rows={section.rows} reviewed={false} {...rowProps} />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <ReviewedSection report={report} {...rowProps} />
    </>
  )
}

interface RowListProps {
  rows: ReportRow[]
  reviewed: boolean
  scanRunning: boolean
  checkRequests: string[]
  onAction: (action: RowAction, params: { packageName: string; verdictKey?: string }) => Promise<void>
}

function RowList(props: RowListProps) {
  return (
    <ul className="divide-y divide-border">
      {props.rows.map((row) => (
        <DependencyRow
          key={row.dependency.name}
          row={row}
          reviewed={props.reviewed}
          scanRunning={props.scanRunning}
          beingRead={props.scanRunning && props.checkRequests.includes(row.dependency.name)}
          onAction={props.onAction}
        />
      ))}
    </ul>
  )
}

/** Verdicts the user marked as reviewed: out of the way, collapsed, each with an undo (stories 31 to 33). */
function ReviewedSection(props: { report: Report } & Omit<RowListProps, 'rows' | 'reviewed'>) {
  const [open, setOpen] = useState(false)
  const rows = props.report.reviewed
  if (rows.length === 0) return null

  return (
    <section data-testid="reviewed-section" className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium hover:bg-secondary/50"
      >
        Reviewed ({rows.length})
        <span aria-hidden className="text-xs text-muted-foreground">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && (
        <div className="border-t border-border">
          <RowList rows={rows} reviewed scanRunning={props.scanRunning} checkRequests={props.checkRequests} onAction={props.onAction} />
        </div>
      )}
    </section>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>
  )
}

function ErrorPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
      <p className="font-medium text-destructive">{title}</p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  )
}
