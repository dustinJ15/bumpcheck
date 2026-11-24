/**
 * The report itself: every dependency of a project, grouped and sorted, or
 * the state that stands in for it (loading, waiting for a first scan, empty).
 *
 * Used by two pages:
 *   - the owner's project page, which passes `onAction`, so rows get their
 *     buttons and reviewed verdicts get their collapsed section;
 *   - the public view (src/pages/(app)/share/[id].tsx), which passes no
 *     `onAction` and no reviewed keys. The rows then render no buttons
 *     (src/components/report/DependencyRow.tsx), and there is no reviewed
 *     section, because review state is the owner's and is not public.
 *
 * What is listed where is decided by pure code: `buildReport` in
 * src/core/report.ts. This file only draws its result.
 */

import { useState } from 'react'
import { DependencyRow, type RowActionHandler } from '@/components/report/DependencyRow'
import { ErrorPanel, Panel } from '@/components/report/Panels'
import type { DependencyGroup, DependencyResult, ScanStatus } from '@/core/model'
import { buildReport, type Report, type ReportRow, type SectionId, type VerdictsByKey } from '@/core/report'
import type { useVerdicts } from '@/lib/records'

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

export function ReportBody(props: {
  scanStatus: ScanStatus
  dependencies: DependencyResult[]
  /** Verdict keys the owner marked as reviewed. Empty on the public view. */
  reviewedKeys: string[]
  /** Package names being read right now by a "check this one". Empty on the public view. */
  checkRequests: string[]
  verdicts: ReturnType<typeof useVerdicts>
  scanRunning: boolean
  /** Sends a row's button press to a server action. Left out on the public view: no buttons are drawn. */
  onAction?: RowActionHandler
}) {
  const { dependencies, verdicts } = props
  const readOnly = props.onAction === undefined

  if (dependencies.length === 0) {
    if (props.scanRunning) {
      return (
        <div data-testid="report-waiting">
          <Panel>The report will appear here when the first scan finishes.</Panel>
        </div>
      )
    }
    if (props.scanStatus === 'done') {
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
          <span className="text-muted-foreground">{readOnly ? 'No breaking upgrades.' : 'Nothing breaking to review.'}</span>
        ) : (
          <span className="font-medium">
            {report.unreviewedBreaking} breaking {report.unreviewedBreaking === 1 ? 'upgrade' : 'upgrades'}
            {readOnly ? '.' : ' to review.'}
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
  onAction?: RowActionHandler
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
