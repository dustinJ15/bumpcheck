/**
 * The pages the unsubscribe route answers with. Plain HTML written here,
 * not part of the app's React pages: the reader is signed out, may be
 * arriving from a mail client's built-in browser, and needs nothing but a
 * sentence and at most one button. No script, image, font or stylesheet is
 * loaded. The colours and the mark are the app's own (src/styles.css), so the
 * page looks like the rest of bumpcheck.
 *
 * Every value put into a page is escaped: the repo name comes from a
 * project row, the token from the address bar.
 *
 * Pure: no I/O, no platform imports.
 */

import { escapeHtml } from './alert-email'
import { UNSUBSCRIBE_PATH } from './unsubscribe-token'

export type UnsubscribePage =
  /** The link was opened. Nothing has changed yet: one button does it. */
  | { kind: 'confirm'; repo: string; token: string }
  /** Alerts are off now (or already were, for a POST). */
  | { kind: 'done'; repo: string | null }
  /** The link was opened and alerts were already off. */
  | { kind: 'already-off'; repo: string }
  /** The token is missing, malformed, tampered with, or signed by another key. */
  | { kind: 'invalid' }
  /** The worker has no signing key, so no link can be checked. */
  | { kind: 'cannot-check' }
  /** The project could not be read or written. */
  | { kind: 'failed' }

export function renderUnsubscribePage(page: UnsubscribePage): string {
  const { title, body } = contentOf(page)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)} · bumpcheck</title>
<style>
  body { margin: 0; padding: 48px 16px; background: #f3f4f6; color: #1f2328;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
  main { max-width: 480px; margin: 0 auto; padding: 24px; background: #ffffff;
    border: 1px solid #d9dde3; border-radius: 7px; }
  h1 { margin: 0 0 12px; font-size: 20px; line-height: 1.4; overflow-wrap: anywhere; }
  p { margin: 0 0 12px; color: #59636e; font-size: 14px; }
  .brand { display: flex; align-items: center; gap: 8px; margin: 0 0 16px; color: #1f2328; font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; }
  .brand svg { width: 20px; height: 20px; }
  button { margin: 4px 0 12px; padding: 9px 16px; border: 0; border-radius: 6px; background: #0b57d0;
    color: #ffffff; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  a { color: #0b57d0; }
</style>
</head>
<body>
<main data-page="${page.kind}">
  <p class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="#0b57d0"/><path d="M16 7 L24 16 H19 V25 H13 V16 H8 Z" fill="#ffffff"/></svg>bumpcheck</p>
  <h1>${escapeHtml(title)}</h1>
${body}
  <p><a href="/">Go to bumpcheck</a></p>
</main>
</body>
</html>
`
}

function contentOf(page: UnsubscribePage): { title: string; body: string } {
  const p = (text: string) => `  <p>${escapeHtml(text)}</p>`
  switch (page.kind) {
    case 'confirm':
      return {
        title: `Stop alert emails for ${page.repo}?`,
        body: [
          p('bumpcheck will stop emailing you about new breaking upgrades in this project. Nothing else changes, and you do not need to sign in.'),
          `  <form method="post" action="${escapeHtml(`${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(page.token)}`)}">`,
          '    <button type="submit">Stop these emails</button>',
          '  </form>',
        ].join('\n'),
      }
    case 'done':
      return {
        title: page.repo === null ? 'Alert emails for this project are off.' : `Alert emails for ${page.repo} are off.`,
        body: p("You will not get another alert email for this project. You can turn alerts back on at any time on the project's settings page."),
      }
    case 'already-off':
      return {
        title: `Alert emails for ${page.repo} are already off.`,
        body: p('There is nothing to do. You will not get alert emails for this project.'),
      }
    case 'invalid':
      return {
        title: 'This unsubscribe link is not valid.',
        body: p("Nothing was changed. The link may have been cut short when it was copied. Use the link in a more recent email, or sign in and turn alerts off on the project's settings page."),
      }
    case 'cannot-check':
      return {
        title: 'This link cannot be checked right now.',
        body: p("Nothing was changed. Try again later, or sign in and turn alerts off on the project's settings page."),
      }
    case 'failed':
      return {
        title: 'That did not work.',
        body: p("Nothing was changed. Try again in a moment, or sign in and turn alerts off on the project's settings page."),
      }
  }
}
