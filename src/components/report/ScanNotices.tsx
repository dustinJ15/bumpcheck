/**
 * The notices on the project page that explain why a scan did not do what
 * the user might expect. Each one is a limit or a failure, said in words
 * (stories 25, 27, 28, 29):
 *
 *   cooldown       "scan now" was pressed inside its cooldown; says when it returns
 *   scan failed    the last scan failed; its reason, and a retry
 *   scan cap       the last scan stopped at its limit; later scans read the rest
 *   daily limit    the app's daily AI limit has been reached
 *   not answered   GitHub refused some release notes; the next scan asks again
 *
 * Nothing is decided here. The cooldown notice shows what the server
 * answered when it refused (its clock, not the browser's); the hint on a
 * failed scan uses `scanNowCooldown` (src/core/limits.ts), the function the
 * server refuses with; the counts come from `countDeferred` (src/core/report.ts).
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Badge, Button, type BadgeProps } from '@/components/ui'
import { LIMITS } from '@/config'
import { isoToTime, nextUtcDayStart, scanNowCooldown } from '@/core/limits'
import type { DependencyResult } from '@/core/model'
import { countDeferred } from '@/core/report'
import type { ProjectRow } from '@/lib/records'

/** The current time, refreshed twice a minute, so a notice about a time does not go stale on an open page. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export function ScanNotices(props: {
  project: ProjectRow
  dependencies: DependencyResult[]
  /**
   * Set when the user pressed "scan now" (or Retry) and the server refused
   * because of the cooldown: the time the server said it will be available.
   */
  cooldownUntil: number | null
  /** A scan-now request is being sent. */
  starting: boolean
  onScanNow: () => void
}) {
  const { project, dependencies } = props
  const now = useNow()
  const cooldown = scanNowCooldown({ lastRequestedAt: isoToTime(project.lastScanRequestedAt), now })
  const deferred = countDeferred(dependencies)
  const nextDueAt = isoToTime(project.nextDueAt)

  return (
    <>
      {props.cooldownUntil !== null && (
        <Notice testId="notice-cooldown" tone="info" label="Cooling down" title="Scan now is cooling down">
          It will be available again at {clockTime(props.cooldownUntil)}. A scan can be requested once every{' '}
          {LIMITS.scanNowCooldownMs / 60_000} minutes.
        </Notice>
      )}

      {project.scanStatus === 'failed' && (
        <Notice
          testId="notice-scan-failed"
          tone="error"
          label="Scan failed"
          title="The last scan failed"
          action={
            <Button size="sm" variant="outline" loading={props.starting} onClick={props.onScanNow}>
              Retry scan
            </Button>
          }
        >
          {project.scanError ?? 'Unknown reason.'}
          {dependencies.length > 0 && ' The results below are from the last scan that finished.'} bumpcheck will try again at
          the next daily scan{nextDueAt !== null && ` (after ${dayAndTime(nextDueAt)})`}.
          {cooldown.coolingDown && ` Retry will be available at ${clockTime(cooldown.availableAt)}.`}
        </Notice>
      )}

      {deferred.dailyCeiling > 0 && (
        <Notice testId="notice-daily-ceiling" tone="warning" label="Daily limit" title="The app's daily AI limit has been reached">
          {upgrades(deferred.dailyCeiling)} could not be read. This is a limit, not a fault: bumpcheck makes at most{' '}
          {LIMITS.aiCallsPerDay} AI calls a day across all its users. The limit resets at midnight UTC (
          {clockTime(nextUtcDayStart(now))} your time); scans after that will read them.
        </Notice>
      )}

      {deferred.scanCap > 0 && (
        <Notice testId="notice-scan-cap" tone="neutral" label="Scan limit" title="The last scan stopped at its limit">
          A scan reads at most its limit of {LIMITS.newVerdictsPerScan} new verdicts. {upgrades(deferred.scanCap)}{' '}
          {deferred.scanCap === 1 ? 'has' : 'have'} not been read yet; later scans will read {deferred.scanCap === 1 ? 'it' : 'them'}.
        </Notice>
      )}

      {deferred.sourceRefused > 0 && (
        <Notice testId="notice-source-refused" tone="neutral" label="Not read" title="GitHub did not answer for some release notes">
          {upgrades(deferred.sourceRefused)} could not be read this time. The next scan will try again.
        </Notice>
      )}
    </>
  )
}

type Tone = 'info' | 'warning' | 'error' | 'neutral'

const TONE: Record<Tone, { box: string; badge: BadgeProps['variant'] }> = {
  info: { box: 'border-info/50 bg-info/10', badge: 'info' },
  warning: { box: 'border-warning/50 bg-warning/10', badge: 'warning' },
  error: { box: 'border-destructive/40 bg-destructive/10', badge: 'destructive' },
  neutral: { box: 'border-border bg-card', badge: 'secondary' },
}

/** One notice: a coloured label that names its kind, a title, a sentence or two, and an optional button. */
function Notice(props: { testId: string; tone: Tone; label: string; title: string; action?: ReactNode; children: ReactNode }) {
  const tone = TONE[props.tone]
  return (
    <div
      data-testid={props.testId}
      role={props.tone === 'error' ? 'alert' : 'status'}
      className={`flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between ${tone.box}`}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <Badge variant={tone.badge} size="sm" className="shrink-0">
            {props.label}
          </Badge>
          {props.title}
        </p>
        <p className="mt-1 text-muted-foreground">{props.children}</p>
      </div>
      {props.action && <div className="shrink-0">{props.action}</div>}
    </div>
  )
}

function upgrades(count: number): string {
  return `${count} ${count === 1 ? 'upgrade' : 'upgrades'}`
}

/** "12:40 PM", in the reader's own time zone. */
function clockTime(time: number): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "Nov 24, 12:40 PM". */
function dayAndTime(time: number): string {
  return new Date(time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
