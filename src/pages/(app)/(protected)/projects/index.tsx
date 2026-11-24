/**
 * Projects list: the signed-in user's projects, each with its scan status
 * and its count of unreviewed breaking upgrades, and the form that adds one.
 *
 * Reads are live: `useQuery` subscribes to the user's own project rows, so a
 * new project appears, and its scan status changes, without a reload
 * (story 23). The scan job writes its progress to the project row because
 * users cannot watch the job room. The count comes from the same pure
 * function the project page uses (src/core/report.ts), over the project's
 * dependencies and the shared verdicts.
 *
 * Writes are not done here. The form calls the `add-project` server action,
 * which checks the caller, the limits and the repo, and answers with a
 * message for the form to show when it refuses.
 *
 * Gated: (protected)/_layout.tsx requires sign-in for this page.
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useUser, type RecordData } from 'deepspace'
import { ScanStatusLine } from '@/components/report/ScanStatus'
import { Badge, Button, Input } from '@/components/ui'
import { LIMITS } from '@/config'
import type { DependencyResult } from '@/core/model'
import { countUnreviewedBreaking, type VerdictsByKey } from '@/core/report'
import { callAction } from '@/lib/actions'
import { readJson } from '@/lib/json'
import { useVerdicts, type ProjectRow } from '@/lib/records'

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
  // The shared verdicts, for each project's count of breaking upgrades.
  const verdicts = useVerdicts()

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
        <ProjectListItem
          key={record.recordId}
          record={record}
          verdicts={verdicts.status === 'ready' ? verdicts.verdicts : null}
        />
      ))}
    </ul>
  )
}

/** `verdicts` is null until the shared verdicts have loaded: no count is shown before then. */
function ProjectListItem({ record, verdicts }: { record: RecordData<ProjectRow>; verdicts: VerdictsByKey | null }) {
  const project = record.data
  const name = `${project.repoOwner}/${project.repoName}`
  const dependencies = readJson<DependencyResult[]>(project.dependencies) ?? []
  const reviewedKeys = readJson<string[]>(project.reviewedKeys) ?? []
  // Shown once the project has results. A failed re-scan keeps the old ones, so it keeps its count.
  const breaking =
    verdicts !== null && (project.scanStatus === 'done' || dependencies.length > 0)
      ? countUnreviewedBreaking(dependencies, verdicts, reviewedKeys)
      : null

  return (
    <li
      data-testid="project-row"
      data-repo={name}
      data-scan-status={project.scanStatus}
      data-last-scan-at={project.lastScanAt ?? undefined}
      data-breaking-count={breaking ?? undefined}
      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={`/projects/${record.recordId}`}
            className="break-all font-mono text-sm font-medium underline-offset-4 hover:underline"
          >
            {name}
          </Link>
          {breaking !== null &&
            (breaking > 0 ? (
              <Badge data-testid="project-breaking-count" variant="destructive" size="sm" className="shrink-0">
                {breaking} breaking to review
              </Badge>
            ) : (
              <span data-testid="project-breaking-count" className="text-xs text-muted-foreground">
                Nothing breaking to review
              </span>
            ))}
        </p>
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
      <div className="min-w-0 sm:max-w-[55%]">
        <ScanStatusLine project={project} />
      </div>
    </li>
  )
}

function ListMessage({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
