/**
 * The scan status of a project in words: what is happening now, or how the
 * last scan ended. Read from the project row, which the scan job keeps up
 * to date (users cannot watch the job room). Used by the projects list and
 * the project page.
 */

import { Badge } from '@/components/ui'
import type { ScanProgress } from '@/core/model'
import { readJson } from '@/lib/json'
import { formatTime, type ProjectRow } from '@/lib/records'

export function ScanStatusLine({ project }: { project: ProjectRow }) {
  const progress = readJson<ScanProgress>(project.scanProgress)

  switch (project.scanStatus) {
    case 'queued':
      return <StatusBadge variant="secondary" label="Queued" detail="Waiting for its scan to start" />
    case 'scanning':
      return <StatusBadge variant="info" label="Scanning" detail={progress?.message ?? 'Starting'} busy />
    case 'done':
      return <StatusBadge variant="success" label="Scanned" detail={formatTime(project.lastScanAt)} />
    case 'failed':
      return <StatusBadge variant="destructive" label="Scan failed" detail={project.scanError ?? 'Unknown reason'} />
    default:
      return <StatusBadge variant="outline" label="Not scanned" detail="" />
  }
}

function StatusBadge(props: {
  variant: 'secondary' | 'info' | 'success' | 'destructive' | 'outline'
  label: string
  detail: string
  busy?: boolean
}) {
  return (
    <div data-testid="project-scan-status" className="flex min-w-0 items-center gap-2">
      <Badge variant={props.variant} className="shrink-0 gap-1.5">
        {props.busy && (
          <span aria-hidden className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {props.label}
      </Badge>
      {props.detail && <span className="truncate text-xs text-muted-foreground">{props.detail}</span>}
    </div>
  )
}
