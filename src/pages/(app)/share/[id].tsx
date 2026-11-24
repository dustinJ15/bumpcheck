/**
 * Public project view: a project's report for anyone who has its link,
 * signed in or not. Read-only (story 49).
 *
 * It is the owner's project page with every action removed, and it is
 * removed by not being there: the report is drawn by the same component
 * (src/components/report/ReportBody.tsx), which is given no action handler
 * and so renders no buttons. There is no scan now, no check, no reviewed,
 * no retry and no link to the settings.
 *
 * It reads one row of `publicReports` and the shared verdicts, nothing
 * else. A public report holds the repo, the dependency list and the scan
 * status and time: not the owner's id, name or email, and not their review
 * or alert state (src/core/public-report.ts). The project row itself is
 * never sent to this page.
 *
 * The row exists only while the project is public. A private project, a
 * deleted one and a made-up id all find no row and get the same "not
 * available" panel, so the page does not say whether a project exists
 * (story 4). The query is live: when the owner switches back to private the
 * row is removed, and an open page changes to "not available" by itself.
 *
 * Not under (protected)/: a signed-out visitor connects to the record room
 * in the viewer role, which may read these two collections.
 */

import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'deepspace'
import { ErrorPanel, NotAvailablePanel, Panel } from '@/components/report/Panels'
import { ReportBody } from '@/components/report/ReportBody'
import { ScanStatusLine } from '@/components/report/ScanStatus'
import type { DependencyResult } from '@/core/model'
import { readJson } from '@/lib/json'
import { useVerdicts, type PublicReportRow } from '@/lib/records'

export default function PublicReportPage() {
  const { id } = useParams()

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        {id ? <PublicReport projectId={id} /> : <NotAvailable />}
      </div>
    </div>
  )
}

function PublicReport({ projectId }: { projectId: string }) {
  // Exactly one report: the one for this link. Live, so it follows the project.
  const reports = useQuery<PublicReportRow>('publicReports', { where: { projectId } })
  const verdicts = useVerdicts()

  if (reports.status === 'loading') return <Panel>Loading the report...</Panel>
  if (reports.status === 'error') {
    return <ErrorPanel title="Could not load the report">{reports.error ?? 'Reload the page to try again.'}</ErrorPanel>
  }

  const record = reports.records.find((r) => r.recordId === projectId)
  if (!record) return <NotAvailable />

  const report = record.data
  const name = `${report.repoOwner}/${report.repoName}`
  const dependencies = readJson<DependencyResult[]>(report.dependencies) ?? []
  const scanRunning = report.scanStatus === 'queued' || report.scanStatus === 'scanning'

  return (
    <div data-testid="public-report" data-scan-status={report.scanStatus} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Public report · read-only</p>
        <h1 className="break-all font-mono text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <ScanStatusLine
            project={{
              scanStatus: report.scanStatus,
              lastScanAt: report.lastScanAt,
              scanProgress: null,
              // The owner's page gives the reason; the public report does not carry it.
              scanError: 'The latest scan did not finish. Any results below are from the scan before it.',
            }}
          />
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

      {/* No `onAction`: the report is drawn without a single action button. */}
      <ReportBody
        scanStatus={report.scanStatus}
        dependencies={dependencies}
        reviewedKeys={[]}
        checkRequests={[]}
        verdicts={verdicts}
        scanRunning={scanRunning}
      />

      <p className="text-xs text-muted-foreground">
        Made with{' '}
        <Link to="/" className="underline underline-offset-4 hover:text-foreground">
          bumpcheck
        </Link>
        , which reads changelogs to tell which dependency upgrades will break.
      </p>
    </div>
  )
}

/** One panel for every link that shows nothing: private, deleted, or never existed. */
function NotAvailable() {
  return (
    <NotAvailablePanel
      testId="public-report-not-available"
      title="This report is not available"
      action={
        <Link to="/" className="text-primary underline underline-offset-4">
          What is bumpcheck?
        </Link>
      }
    >
      The link may be wrong, or the report may not be shared. If someone sent you this link, ask them to check that the
      report is public.
    </NotAvailablePanel>
  )
}
