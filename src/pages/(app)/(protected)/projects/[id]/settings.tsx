/**
 * Project settings, for the project's owner. Three sections:
 *
 *   Email alerts   the alert switch, "Send me a test", and the send log
 *                  (stories 37, 38, 44, 45)
 *   Public report  the public switch, with the shareable link (stories 47, 48)
 *   Delete         delete the project, after a confirmation (story 51)
 *
 * Nothing here writes a record itself. Each control calls a server action
 * (src/actions/), which checks that the project is the caller's before it
 * does anything. The switches then show what the project row says, which
 * arrives through the live query, so they cannot show a state the server
 * did not store. That is also how "unsubscribe" in an email shows up here:
 * the route turns the setting off and the switch follows.
 *
 * Like the project page, this finds the project among the caller's own rows
 * (src/components/report/OwnProject.tsx): anyone else gets "not available".
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useUser, type RecordData } from 'deepspace'
import { OwnProject } from '@/components/report/OwnProject'
import { ErrorPanel, Panel } from '@/components/report/Panels'
import { Badge, Button, ConfirmModal, Switch } from '@/components/ui'
import { shareLinkPath, type Visibility } from '@/core/public-report'
import { LIMITS } from '@/config'
import { callAction } from '@/lib/actions'
import { formatTime, type AlertRow, type ProjectRow } from '@/lib/records'

/** The idle pause, in days, for the note under the alert switch. */
const IDLE_DAYS = Math.round(LIMITS.idlePauseMs / (24 * 60 * 60 * 1000))

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
            {(record) => <Settings record={record} address={user.email} />}
          </OwnProject>
        ) : (
          <Panel>Loading the project...</Panel>
        )}
      </div>
    </div>
  )
}

function Settings({ record, address }: { record: RecordData<ProjectRow>; address: string }) {
  const project = record.data
  const repo = `${project.repoOwner}/${project.repoName}`
  return (
    <div data-testid="project-settings" className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settings</p>
        <h1 className="break-all font-mono text-xl font-semibold tracking-tight sm:text-2xl">{repo}</h1>
      </header>
      <AlertsSection
        projectId={record.recordId}
        // A boolean column: the record room may hand it back as true or as 1.
        alertsOn={project.alertsEnabled === true || project.alertsEnabled === 1}
        address={address}
      />
      <SharingSection projectId={record.recordId} isPublic={project.visibility === 'public'} />
      <DeleteSection projectId={record.recordId} repo={repo} />
    </div>
  )
}

/**
 * The alert switch, the test email, and the send log.
 *
 * `address` is the signed-in user's own address, shown so they know where
 * alerts go. It is only shown: no action takes an address, and the server
 * reads the recipient from its own record of the user.
 */
function AlertsSection({ projectId, alertsOn, address }: { projectId: string; alertsOn: boolean; address: string }) {
  const [saving, setSaving] = useState(false)
  // What the last accepted request asked for. Until the project row says the
  // same, the switch stays disabled, so a second press cannot repeat it.
  const [requested, setRequested] = useState<boolean | null>(null)
  const waitingForRow = requested !== null && requested !== alertsOn
  // Once the row has caught up the request is done with. Without this, a
  // later change from elsewhere (the unsubscribe link, another tab) would
  // look like a request still waiting, and the switch would stay disabled.
  useEffect(() => {
    if (requested === alertsOn) setRequested(null)
  }, [requested, alertsOn])
  const [error, setError] = useState<string | null>(null)

  async function change(enabled: boolean) {
    setSaving(true)
    setError(null)
    const answer = await callAction('set-alerts', { projectId, enabled })
    setSaving(false)
    if (!answer.success) setError(answer.error)
    // On success the switch is not moved here: the changed project row arrives through the live query.
    setRequested(answer.success ? enabled : null)
  }

  return (
    <section aria-labelledby="alerts-title" className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <h2 id="alerts-title" className="flex flex-wrap items-center gap-2 text-base font-semibold">
            Email alerts
            <Badge data-testid="alerts-state" variant={alertsOn ? 'success' : 'outline'} size="sm">
              {alertsOn ? 'On' : 'Off'}
            </Badge>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {alertsOn ? 'bumpcheck emails ' : 'Switch this on and bumpcheck emails '}
            <span data-testid="alert-address" className="break-all font-mono text-xs text-foreground">
              {address}
            </span>{' '}
            when a daily scan finds a new breaking upgrade in this project. One email covers everything that is new, the
            same verdict is never emailed twice, and every email has a one-click unsubscribe link.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Daily scans pause when you have not opened the project for {IDLE_DAYS} days, and alerts pause with them.
          </p>
        </div>
        <Switch
          aria-label="Email alerts"
          checked={alertsOn}
          disabled={saving || waitingForRow}
          onCheckedChange={(checked) => void change(checked)}
          className="mt-1"
        />
      </div>

      {error && (
        <div data-testid="alerts-error" className="border-t border-border px-4 py-3">
          <ErrorPanel title="That did not work">{error}</ErrorPanel>
        </div>
      )}

      <TestEmail projectId={projectId} address={address} />
      <SendLog projectId={projectId} />
    </section>
  )
}

/** "Send me a test", with how many are left today. The server keeps the count; this only shows it. */
function TestEmail({ projectId, address }: { projectId: string; address: string }) {
  // Undefined: not known yet. Null: no limit (the app owner).
  const [remaining, setRemaining] = useState<number | null | undefined>(undefined)
  const [perDay, setPerDay] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    let current = true
    void callAction<{ remaining: number | null; perDay: number }>('test-email-allowance').then((answer) => {
      if (!current || !answer.success) return
      setRemaining(answer.data.remaining)
      setPerDay(answer.data.perDay)
    })
    return () => {
      current = false
    }
  }, [])

  async function send() {
    setSending(true)
    setResult(null)
    const answer = await callAction<{ remaining: number | null }>('send-test-email', { projectId })
    setSending(false)
    if (answer.success) {
      setRemaining(answer.data.remaining)
      setResult({ ok: true, message: `Test email sent to ${address}.` })
      return
    }
    // A refusal says how many are left too (none, at the limit).
    const left = answer.details?.remaining
    if (typeof left === 'number' || left === null) setRemaining(left)
    setResult({ ok: false, message: answer.error })
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" loading={sending} onClick={() => void send()}>
          Send me a test
        </Button>
        <p data-testid="test-emails-left" data-remaining={remaining ?? ''} className="text-sm text-muted-foreground">
          {remaining === undefined
            ? 'A test email looks exactly like a real alert.'
            : remaining === null
              ? 'No daily limit for the app owner.'
              : `${remaining} of ${perDay ?? remaining} test emails left today.`}
        </p>
      </div>
      {result &&
        (result.ok ? (
          <p data-testid="test-email-result" data-ok="true" role="status" className="text-sm text-foreground">
            {result.message}
          </p>
        ) : (
          <div data-testid="test-email-result" data-ok="false">
            <ErrorPanel title="The test email was not sent">{result.message}</ErrorPanel>
          </div>
        ))}
    </div>
  )
}

/**
 * The send log: every alert and test email for this project, newest first,
 * sent or not (story 45). A live query, so a line appears as it is written.
 */
function SendLog({ projectId }: { projectId: string }) {
  const log = useQuery<AlertRow>('alerts', { where: { projectId } })
  const rows = [...log.records].sort((a, b) => b.data.sentAt.localeCompare(a.data.sentAt))

  return (
    <div className="border-t border-border px-4 py-3">
      <h3 className="text-sm font-semibold">Send log</h3>
      {log.status === 'loading' ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading the send log...</p>
      ) : log.status === 'error' ? (
        <div className="mt-2">
          <ErrorPanel title="Could not load the send log">{log.error ?? 'Reload the page to try again.'}</ErrorPanel>
        </div>
      ) : rows.length === 0 ? (
        <p data-testid="send-log-empty" className="mt-2 text-sm text-muted-foreground">
          No email has been sent for this project yet.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table data-testid="send-log" className="w-full min-w-[28rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Time
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Kind
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Outcome
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.recordId}
                  data-testid="send-log-row"
                  data-kind={row.data.kind}
                  data-outcome={row.data.outcome}
                  className="border-t border-border align-top"
                >
                  <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-xs">{formatTime(row.data.sentAt)}</td>
                  <td className="py-1.5 pr-3">{row.data.kind === 'test' ? 'Test' : 'Alert'}</td>
                  <td className="py-1.5 pr-3">
                    <Badge variant={row.data.outcome === 'sent' ? 'success' : 'destructive'} size="sm">
                      {row.data.outcome === 'sent' ? 'Sent' : 'Failed'}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-muted-foreground">{row.data.failureReason || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Delete, behind a confirmation. On success the project is gone, so the page goes back to the list. */
function DeleteSection({ projectId, repo }: { projectId: string; repo: string }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setDeleting(true)
    setError(null)
    const answer = await callAction('delete-project', { projectId })
    if (answer.success) {
      navigate('/projects')
      return
    }
    setDeleting(false)
    setConfirming(false)
    setError(answer.error)
  }

  return (
    <section aria-labelledby="delete-title" className="rounded-lg border border-destructive/30 bg-card">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="delete-title" className="text-base font-semibold">
            Delete this project
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Removes the project, its send log and its public link, and frees one of your project slots. The verdicts
            are shared with other projects and stay.
          </p>
        </div>
        <Button size="sm" variant="destructive" className="shrink-0" onClick={() => setConfirming(true)}>
          Delete project
        </Button>
      </div>
      {error && (
        <div data-testid="delete-error" className="border-t border-border px-4 py-3">
          <ErrorPanel title="The project was not deleted">{error}</ErrorPanel>
        </div>
      )}
      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void remove()}
        title={`Delete ${repo}?`}
        description="The project, its send log and its public link are removed. This cannot be undone."
        confirmText="Delete project"
        loading={deleting}
      />
    </section>
  )
}

/** The public switch and, while the project is public, its shareable link. */
function SharingSection({ projectId, isPublic }: { projectId: string; isPublic: boolean }) {
  const [saving, setSaving] = useState(false)
  // What the last accepted request asked for. Until the project row says the
  // same, the switch stays disabled, so a second press cannot repeat it.
  const [requested, setRequested] = useState<boolean | null>(null)
  const waitingForRow = requested !== null && requested !== isPublic
  // Once the row has caught up the request is done with (see the alert switch above).
  useEffect(() => {
    if (requested === isPublic) setRequested(null)
  }, [requested, isPublic])
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
