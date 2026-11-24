/**
 * Finds one of the signed-in user's own projects, for the pages only the
 * owner may see (the project page and its settings), or says why there is
 * nothing to show.
 *
 * The project is looked for among the caller's own rows, so someone else's
 * project id, a deleted one and a mistyped one all end the same way: the
 * "not available" panel, which does not say which of those it was. The
 * record room would not send another user's row in any case.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, type RecordData } from 'deepspace'
import { ErrorPanel, NotAvailablePanel, Panel } from '@/components/report/Panels'
import type { ProjectRow } from '@/lib/records'

export function OwnProject(props: {
  projectId: string
  userId: string
  /** Draws the page once the project is found. Called again whenever the row changes. */
  children: (record: RecordData<ProjectRow>) => ReactNode
}) {
  // A live list of the caller's own projects: a change made by a scan, or in another tab, arrives by itself.
  const projects = useQuery<ProjectRow>('projects', { where: { userId: props.userId } })

  if (projects.status === 'loading') return <Panel>Loading the project...</Panel>
  if (projects.status === 'error') {
    return <ErrorPanel title="Could not load the project">{projects.error ?? 'Reload the page to try again.'}</ErrorPanel>
  }

  const record = projects.records.find((r) => r.recordId === props.projectId)
  if (!record) {
    return (
      <NotAvailablePanel
        testId="project-not-available"
        title="This project is not available"
        action={
          <Link to="/projects" className="text-primary underline underline-offset-4">
            Back to your projects
          </Link>
        }
      >
        It may be private and belong to someone else, or it may have been deleted. Check the link, or ask its owner to share
        it.
      </NotAvailablePanel>
    )
  }

  return <>{props.children(record)}</>
}
