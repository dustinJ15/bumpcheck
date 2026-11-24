/**
 * The plain boxes the report pages put a message in: a neutral panel, an
 * error panel, and the "not available" panel for a link that leads to
 * nothing the reader may see.
 */

import type { ReactNode } from 'react'

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>
  )
}

export function ErrorPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-l-4 border-destructive/30 border-l-destructive bg-card px-4 py-3 text-sm">
      <p className="font-medium text-destructive">{title}</p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  )
}

/**
 * Shown for a link that does not lead to something the reader may see. The
 * words are the same whether the thing is private, deleted or never
 * existed, so the page does not give away which.
 */
export function NotAvailablePanel(props: { testId: string; title: string; children: ReactNode; action: ReactNode }) {
  return (
    <div data-testid={props.testId} className="rounded-lg border border-border bg-card px-6 py-12 text-center">
      <h1 className="text-lg font-semibold">{props.title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{props.children}</p>
      <div className="mt-6 text-sm font-medium">{props.action}</div>
    </div>
  )
}
