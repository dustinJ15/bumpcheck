/**
 * Projects list: the signed-in user's projects, each with its scan status,
 * and the form that adds one.
 *
 * Reads are live: `useQuery` subscribes to the user's own project rows, so a
 * new project appears, and its scan status changes, without a reload
 * (story 23). The scan job writes its progress to the project row because
 * users cannot watch the job room.
 *
 * Writes are not done here. The form calls the `add-project` server action,
 * which checks the caller, the limits and the repo, and answers with a
 * message for the form to show when it refuses.
 *
 * Gated: (protected)/_layout.tsx requires sign-in for this page.
 */

import { useState, type FormEvent } from 'react'
import { useQuery, useUser, type RecordData } from 'deepspace'
import { Badge, Button, Input } from '@/components/ui'
import { LIMITS } from '@/config'
import type { DependencyResult, ScanProgress, ScanStatus } from '@/core/model'
import { callAction } from '@/lib/actions'

/** The columns of a project row this page reads. */
interface ProjectRow {
  userId: string
  repoOwner: string
  repoName: string
  scanStatus: ScanStatus
  scanProgress: ScanProgress | string | null
  scanError: string | null
  lastScanAt: string | null
  dependencies: DependencyResult[] | string | null
}

export default function ProjectsPage() {
  const { user } = useUser()

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a public GitHub repository. bumpcheck reads its package.json and tells you which upgrades will break.
          </p>
        </header>

        <AddProjectForm />

        {user ? <ProjectList userId={user.id} /> : <ListMessage>Loading your projects...</ListMessage>}
      </div>
    </div>
  )
}

function AddProjectForm() {
  const [repo, setRepo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const answer = await callAction<{ projectId: string }>('add-project', { repo })
    setSubmitting(false)
    if (answer.success) setRepo('')
    else setError(answer.error)
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4" data-testid="add-project-form">
      <label htmlFor="add-project-repo" className="text-sm font-medium">
        Add a project
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id="add-project-repo"
          name="repo"
          value={repo}
          onChange={(event) => setRepo(event.target.value)}
          placeholder="owner/repo or https://github.com/owner/repo"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'add-project-error' : 'add-project-hint'}
          className="font-mono"
        />
        <Button type="submit" loading={submitting} disabled={repo.trim() === ''} className="shrink-0">
          Add project
        </Button>
      </div>
      {error ? (
        <p id="add-project-error" data-testid="add-project-error" role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id="add-project-hint" className="mt-2 text-xs text-muted-foreground">
          Public repositories with a package.json at the root. Up to {LIMITS.projectsPerUser} projects.
        </p>
      )}
    </form>
  )
}

function ProjectList({ userId }: { userId: string }) {
  // `where` matters: the read rule also lets a user read other people's
  // public projects, and this list is "mine" only.
  const { records, status, error } = useQuery<ProjectRow>('projects', {
    where: { userId },
    orderBy: 'createdAt',
    orderDir: 'desc',
  })

  if (status === 'loading') return <ListMessage>Loading your projects...</ListMessage>
  if (status === 'error') {
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
        <p className="font-medium text-destructive">Could not load your projects</p>
        <p className="mt-1 text-muted-foreground">{error ?? 'Reload the page to try again.'}</p>
      </div>
    )
  }
  if (records.length === 0) {
    return (
      <div data-testid="projects-empty" className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
        <h2 className="text-base font-semibold">No projects yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Add a repository above. Its first scan starts straight away.
        </p>
      </div>
    )
  }

  return (
    <ul data-testid="projects-list" className="divide-y divide-border rounded-lg border border-border bg-card">
      {records.map((record) => (
        <ProjectListItem key={record.recordId} record={record} />
      ))}
    </ul>
  )
}

function ProjectListItem({ record }: { record: RecordData<ProjectRow> }) {
  const project = record.data
  const name = `${project.repoOwner}/${project.repoName}`
  const dependencies = readJson<DependencyResult[]>(project.dependencies) ?? []

  return (
    <li
      data-testid="project-row"
      data-repo={name}
      data-scan-status={project.scanStatus}
      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-sm font-medium">{name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <a
            href={`https://github.com/${name}`}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            View on GitHub
          </a>
          {project.scanStatus === 'done' && (
            <span>
              {' · '}
              {dependencies.length} {dependencies.length === 1 ? 'dependency' : 'dependencies'}
            </span>
          )}
        </p>
      </div>
      <ScanStatusLine project={project} />
    </li>
  )
}

/** The scan status in words: what is happening, or how the last scan ended. */
function ScanStatusLine({ project }: { project: ProjectRow }) {
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
    <div data-testid="project-scan-status" className="flex min-w-0 items-center gap-2 sm:max-w-[55%] sm:justify-end">
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

function ListMessage({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** A JSON column, whether the client hands it over parsed or as text. */
function readJson<T>(value: T | string | null | undefined): T | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? '' : time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
