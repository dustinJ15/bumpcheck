/**
 * One dependency on the project page: its name, the version jump, the state
 * it is in, the verdict when there is one, and the actions that apply.
 *
 * What state a dependency is in, and where it is listed, is decided in
 * src/core/report.ts. This file only draws a row for a state.
 */

import { useState, type ReactNode } from 'react'
import { Badge, Button, type BadgeProps } from '@/components/ui'
import { LIMITS } from '@/config'
import type { DependencyResult, NotCheckedReason, Verdict } from '@/core/model'
import { isReviewable, type ReportRow, type RowState } from '@/core/report'
import { formatTime } from '@/lib/records'

/** The server actions a row can ask for. The page supplies the function that calls them. */
export type RowAction = 'check-dependency' | 'retry-verdict' | 'mark-reviewed' | 'undo-reviewed'

const STATE_BADGE: Record<RowState, { label: string; variant: BadgeProps['variant'] }> = {
  breaking: { label: 'Breaking', variant: 'destructive' },
  unclear: { label: 'Unclear', variant: 'warning' },
  failed: { label: 'Verdict failed', variant: 'warning' },
  'no-changelog': { label: 'No changelog found', variant: 'secondary' },
  pending: { label: 'Not read yet', variant: 'secondary' },
  safe: { label: 'Safe', variant: 'success' },
  'not-read': { label: 'Not read', variant: 'outline' },
  'up-to-date': { label: 'Up to date', variant: 'outline' },
  'not-checked': { label: 'Not checked', variant: 'outline' },
}

const NOT_CHECKED_REASON: Record<NotCheckedReason, string> = {
  git: 'it points at a git repository',
  local: 'it points at a local path',
  workspace: 'it is a workspace link',
  alias: 'it is an alias for another package',
  url: 'it points at a tarball URL',
  unbounded: 'it allows every version',
  tag: 'it names a tag, not a version',
  'invalid-range': 'its version is not a valid range',
  unpublished: 'the package is not on the public npm registry',
  'no-stable-release': 'the package has no stable release',
}

export function DependencyRow(props: {
  row: ReportRow
  /** True in the collapsed "reviewed" section. */
  reviewed: boolean
  /** A scan or a check is running for the project: no new request can start. */
  scanRunning: boolean
  /** This dependency is the one being read right now. */
  beingRead: boolean
  onAction: (action: RowAction, params: { packageName: string; verdictKey?: string }) => Promise<void>
}) {
  const { row, reviewed, scanRunning, beingRead } = props
  const { dependency, verdict, state } = row
  const [working, setWorking] = useState(false)
  const badge = STATE_BADGE[state]

  async function run(action: RowAction) {
    setWorking(true)
    await props.onAction(action, { packageName: dependency.name, verdictKey: dependency.verdictKey })
    setWorking(false)
  }

  return (
    <li
      data-testid="dependency-row"
      data-package={dependency.name}
      data-state={state}
      data-decided-at={verdict?.decidedAt}
      className="px-4 py-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span data-testid="package-name" className="break-all font-mono text-sm font-medium">
              {dependency.name}
            </span>
            <Badge data-testid="state-badge" variant={badge.variant} size="sm" className="shrink-0">
              {badge.label}
            </Badge>
          </div>
          <Versions dependency={dependency} />
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {state === 'not-read' && (
            <Button size="sm" variant="outline" loading={working || beingRead} disabled={scanRunning} onClick={() => run('check-dependency')}>
              Check this one
            </Button>
          )}
          {state === 'failed' && (
            <Button size="sm" variant="outline" loading={working || beingRead} disabled={scanRunning} onClick={() => run('retry-verdict')}>
              Retry
            </Button>
          )}
          {!reviewed && isReviewable(row) && (
            <Button size="sm" variant="outline" loading={working} onClick={() => run('mark-reviewed')}>
              Mark as reviewed
            </Button>
          )}
          {reviewed && (
            <Button size="sm" variant="outline" loading={working} onClick={() => run('undo-reviewed')}>
              Undo
            </Button>
          )}
        </div>
      </div>

      <StateNote row={row} />
      {verdict !== null && verdict.status === 'ready' && (
        <VerdictDetails verdict={verdict} startOpen={state === 'breaking' && !reviewed} />
      )}
    </li>
  )
}

/** The version on, and the version available, in monospace (story 13). */
function Versions({ dependency }: { dependency: DependencyResult }) {
  let text = dependency.declared
  if (dependency.current !== null && dependency.target !== null) {
    text = dependency.triage === 'up-to-date' ? dependency.current : `${dependency.current} → ${dependency.target}`
  }
  return (
    <p data-testid="versions" className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
      {text}
    </p>
  )
}

/** One or two plain sentences for the states that have no verdict text of their own. */
function StateNote({ row }: { row: ReportRow }) {
  const { dependency, verdict, state } = row
  const deferred = deferredNote(dependency)

  switch (state) {
    case 'failed':
      return (
        <Note>
          This upgrade could not be read: {verdict?.failureReason ?? 'the judge did not answer'}. Last tried{' '}
          {formatTime(verdict?.decidedAt)}.{deferred && ` ${deferred}`} <SourceLink verdict={verdict} />
        </Note>
      )
    case 'no-changelog':
      return (
        <Note>
          No changelog found, so nothing was read.{' '}
          {verdict?.sourceUrl && (
            <>
              Look at the package&apos;s <ExternalLink href={verdict.sourceUrl}>{linkLabel(verdict.sourceUrl)}</ExternalLink>.
            </>
          )}
        </Note>
      )
    case 'pending':
      return <Note>{deferred ?? 'A major upgrade that has not been read yet. The next scan will read it.'}</Note>
    case 'not-read':
      return (
        <Note>
          {dependency.triage === 'patch' ? 'Patch' : 'Minor'} upgrade. Not read, so not known to be safe.
          {deferred && ` ${deferred}`}
        </Note>
      )
    case 'not-checked':
      return (
        <Note>
          Not checked because{' '}
          {dependency.notCheckedReason ? NOT_CHECKED_REASON[dependency.notCheckedReason] : 'it cannot be looked up'}.
        </Note>
      )
    default:
      return null
  }
}

/** Why this dependency was left unread, when a limit or a refusal stopped it. Limits come from src/config.ts. */
function deferredNote(dependency: DependencyResult): string | null {
  if (dependency.deferredBy === 'scan-cap') {
    return `Not read yet: the scan reached its limit of ${LIMITS.newVerdictsPerScan} new verdicts. A later scan will read it.`
  }
  if (dependency.deferredBy === 'daily-ceiling') {
    return "Not read yet: the app's daily AI limit was reached. Try again tomorrow."
  }
  if (dependency.deferredBy === 'source-refused') {
    return 'Not read this time: GitHub did not answer the request for its release notes. The next scan will try again.'
  }
  return null
}

/** A verdict that was read: summary, the changes, the cut notice, and the link to its source. */
function VerdictDetails({ verdict, startOpen }: { verdict: Verdict; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const changes = verdict.changes

  return (
    <div data-testid="verdict-details" className="mt-2 space-y-2 text-sm">
      {verdict.summary && <p>{verdict.summary}</p>}

      {changes.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="cursor-pointer text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          {open ? 'Hide' : 'Show'} {changes.length} {changes.length === 1 ? 'change' : 'changes'}
        </button>
      )}
      {open && changes.length > 0 && (
        <ol className="space-y-2">
          {changes.map((change, index) => (
            <li key={index} data-testid="verdict-change" className="rounded-md border border-border bg-background px-3 py-2">
              <p className="font-medium">{change.title}</p>
              <dl className="mt-1 space-y-1 text-muted-foreground">
                <div>
                  <dt className="inline font-medium text-foreground">What changed: </dt>
                  <dd className="inline">{change.whatChanged}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground">What to do: </dt>
                  <dd className="inline">{change.whatToDo}</dd>
                </div>
              </dl>
              {change.apiNames.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {change.apiNames.map((name) => (
                    <code key={name} className="break-all rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
                      {name}
                    </code>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {verdict.inputTruncated && (
        <p data-testid="changelog-cut-notice" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          The changelog was too long and was cut off before it was read, so this verdict may be incomplete.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        <SourceLink verdict={verdict} /> Judged for{' '}
        <span className="font-mono">
          {verdict.fromVersion} → {verdict.toVersion}
        </span>
        .
      </p>
    </div>
  )
}

/** The link to what the verdict was read from (story 15). */
function SourceLink({ verdict }: { verdict: Verdict | null }) {
  if (!verdict?.sourceUrl) return null
  return (
    <>
      Read from the <ExternalLink href={verdict.sourceUrl}>{linkLabel(verdict.sourceUrl)}</ExternalLink>.
    </>
  )
}

/** What a source link points at, going by its address. */
function linkLabel(url: string): string {
  if (url.includes('npmjs.com')) return 'npm page'
  if (url.endsWith('/releases')) return 'releases page'
  return 'changelog'
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
      {children}
    </a>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-muted-foreground">{children}</p>
}
