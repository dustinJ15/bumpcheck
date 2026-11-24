/**
 * Project settings, for the project's owner.
 *
 * For now it has one control: the public switch, with the shareable link
 * (stories 47 and 48). Ticket 06 adds email alerts, the test email, the
 * send log and delete to this page.
 *
 * The switch does not write anything itself. It calls the `set-visibility`
 * server action (src/actions/visibility.ts), which checks that the project
 * is the caller's, stores the choice, and writes or removes the project's
 * public report. The switch then shows what the project row says, which
 * arrives through the live query, so it cannot show a state the server did
 * not store.
 *
 * Like the project page, this finds the project among the caller's own rows
 * (src/components/report/OwnProject.tsx): anyone else gets "not available".
 */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUser, type RecordData } from 'deepspace'
import { OwnProject } from '@/components/report/OwnProject'
import { ErrorPanel, Panel } from '@/components/report/Panels'
import { Badge, Button, Switch } from '@/components/ui'
import { shareLinkPath, type Visibility } from '@/core/public-report'
import { callAction } from '@/lib/actions'
import type { ProjectRow } from '@/lib/records'

export default function ProjectSettingsPage() {
  const { id } = useParams()
  const { user } = useUser()

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Link
          to={id ? `/projects/${id}` : '/projects'}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to the report
        </Link>
        {user && id ? (
          <OwnProject projectId={id} userId={user.id}>
            {(record) => <Settings record={record} />}
          </OwnProject>
        ) : (
          <Panel>Loading the project...</Panel>
        )}
      </div>
    </div>
  )
}

function Settings({ record }: { record: RecordData<ProjectRow> }) {
  const project = record.data
  return (
    <div data-testid="project-settings" className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settings</p>
        <h1 className="break-all font-mono text-xl font-semibold tracking-tight sm:text-2xl">
          {project.repoOwner}/{project.repoName}
        </h1>
      </header>
      <SharingSection projectId={record.recordId} isPublic={project.visibility === 'public'} />
    </div>
  )
}

/** The public switch and, while the project is public, its shareable link. */
function SharingSection({ projectId, isPublic }: { projectId: string; isPublic: boolean }) {
  const [saving, setSaving] = useState(false)
  // What the last accepted request asked for. Until the project row says the
  // same, the switch stays disabled, so a second press cannot repeat it.
  const [requested, setRequested] = useState<boolean | null>(null)
  const waitingForRow = requested !== null && requested !== isPublic
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}${shareLinkPath(projectId)}`

  async function change(makePublic: boolean) {
    setSaving(true)
    setError(null)
    setCopied(false)
    const visibility: Visibility = makePublic ? 'public' : 'private'
    const answer = await callAction('set-visibility', { projectId, visibility })
    setSaving(false)
    if (!answer.success) setError(answer.error)
    // On success the switch is not moved here: the changed project row arrives through the live query.
    setRequested(answer.success ? makePublic : null)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // No clipboard access (an old browser, or a refused permission): the link is on the page to copy by hand.
      setCopied(false)
    }
  }

  return (
    <section aria-labelledby="sharing-title" className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <h2 id="sharing-title" className="flex flex-wrap items-center gap-2 text-base font-semibold">
            Public report
            <Badge data-testid="visibility-state" variant={isPublic ? 'success' : 'outline'} size="sm">
              {isPublic ? 'Public' : 'Private'}
            </Badge>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPublic
              ? 'Anyone with the link can read this report. They cannot change anything, and it does not show your name or email.'
              : 'Only you can see this project. Switch this on to get a link you can share; readers will not need an account.'}
          </p>
        </div>
        <Switch
          aria-label="Public report"
          checked={isPublic}
          disabled={saving || waitingForRow}
          onCheckedChange={(checked) => void change(checked)}
          className="mt-1"
        />
      </div>

      {isPublic && (
        <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <a
            data-testid="share-link"
            href={link}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 break-all font-mono text-xs text-primary underline underline-offset-4"
          >
            {link}
          </a>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      )}

      {error && (
        <div data-testid="visibility-error" className="border-t border-border px-4 py-3">
          <ErrorPanel title="That did not work">{error}</ErrorPanel>
        </div>
      )}
    </section>
  )
}
