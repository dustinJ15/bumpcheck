/**
 * The alert composer: one alert email, written by code from stored verdicts.
 * No AI is involved (decision 11), so an alert costs one email and nothing else.
 *
 * In: a project, the breaking verdicts to tell its owner about, the app's
 * origin (for links) and the signed unsubscribe link. Out: subject, HTML
 * body, text body and headers, or null when there is nothing to send.
 *
 * How it is built, so the two bodies cannot drift apart:
 *
 *   1. `wordsFor` turns the input into the words the email says: every
 *      sentence, label and link, as plain text. This is the only place
 *      wording lives.
 *   2. `renderText` and `renderHtml` lay those same words out. Neither adds
 *      a sentence of its own.
 *
 * Everything dynamic is untrusted. Package names, summaries and notes come
 * from changelogs through the judge, and a changelog can say anything:
 *
 *   - in the HTML, every value goes through `escapeHtml`, in text and in
 *     attributes alike;
 *   - a changelog link is kept only when it is an http(s) URL;
 *   - anything that reaches the subject or a header goes through
 *     `singleLine`, which removes line breaks, so no value can start a new
 *     header. The same is done to each piece of a verdict, so none can
 *     start a new line in the text body.
 *
 * The HTML is written for mail clients, not browsers: tables for layout,
 * inline styles, no images, fonts or scripts. A small style block adds a
 * dark variant for clients that honour it; without it the light version
 * still reads correctly.
 *
 * Pure: no I/O, no platform imports.
 */

import type { DependencyGroup } from './model'

/** One breaking upgrade, as the email shows it. */
export interface AlertItem {
  /** The shared verdict this came from. Recorded in the send log. */
  verdictKey: string
  packageName: string
  group: DependencyGroup
  /** The version the project is on, and the one available. */
  fromVersion: string
  toVersion: string
  summary: string
  /** How many changes the verdict lists; the email shows the first one's note. */
  changeCount: number
  firstWhatToDo: string | null
  /** The changelog the verdict was read from. */
  sourceUrl: string | null
}

export interface AlertEmailInput {
  /** "test" is the email the settings page's "Send me a test" button sends. */
  kind: 'alert' | 'test'
  project: { id: string; repoOwner: string; repoName: string }
  /** In the order to show them. The caller puts runtime dependencies first. */
  items: AlertItem[]
  /** True when `items` is the built-in example, because the project has nothing breaking to show. */
  sample?: boolean
  /** Where the app lives, such as "https://bumpcheck.app.space". Every link the email makes starts with it. */
  appOrigin: string
  /** The signed one-click unsubscribe link for this project (./unsubscribe-token.ts). */
  unsubscribeUrl: string
}

export interface AlertEmail {
  subject: string
  html: string
  text: string
  headers: Record<string, string>
  /** The verdicts this email covered. Empty for the built-in example. */
  verdictKeys: string[]
}

/** What a test email shows when the project has no breaking upgrade of its own. */
export const SAMPLE_ALERT_ITEM: AlertItem = {
  verdictKey: 'example',
  packageName: 'example-router',
  group: 'runtime',
  fromVersion: '4.18.0',
  toVersion: '5.1.0',
  summary: 'Two routing helpers were removed in 5.0.0.',
  changeCount: 2,
  firstWhatToDo: 'Replace `app.del()` with `app.delete()`.',
  sourceUrl: null,
}

export function composeAlertEmail(input: AlertEmailInput): AlertEmail | null {
  if (input.items.length === 0) return null

  const words = wordsFor(input)
  const unsubscribeUrl = headerUrl(input.unsubscribeUrl)
  return {
    subject: words.subject,
    html: renderHtml(words),
    text: renderText(words),
    headers: {
      // RFC 8058: mail clients show their own unsubscribe button and send
      // one POST to this link. The route answers it without a sign-in.
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    verdictKeys: input.sample ? [] : input.items.map((item) => item.verdictKey),
  }
}

// ------------------------------------------------------------- the words

interface Link {
  label: string
  url: string
}

interface ItemWords {
  packageName: string
  /** "4.18.0 → 5.1.0" */
  versions: string
  /** "runtime dependency" or "dev dependency" */
  group: string
  summary: string
  whatToDoLabel: string
  whatToDo: string | null
  /** "2 more changes are listed in the report." Null when the verdict lists one change. */
  moreChanges: string | null
  changelog: Link | null
}

/** Everything the email says, as plain text. Both bodies are laid out from this. */
interface Words {
  subject: string
  heading: string
  /** Shown only by a test email. */
  testNote: string | null
  intro: string
  items: ItemWords[]
  report: Link
  reason: string
  unsubscribe: Link
  settings: Link
  signature: string
}

function wordsFor(input: AlertEmailInput): Words {
  const count = input.items.length
  const repo = singleLine(`${input.project.repoOwner}/${input.project.repoName}`)
  const upgrades = `${count} new breaking ${count === 1 ? 'upgrade' : 'upgrades'}`
  const heading = `${upgrades} in ${repo}`
  const projectUrl = `${input.appOrigin}/projects/${encodeURIComponent(input.project.id)}`
  const isTest = input.kind === 'test'

  return {
    subject: singleLine(`${isTest ? '[Test] ' : ''}bumpcheck: ${heading}`),
    heading,
    testNote: !isTest
      ? null
      : input.sample
        ? `This is a test email. Real alerts look like this one. ${repo} has no breaking upgrade to show right now, so the package below is a made-up example.`
        : 'This is a test email. Real alerts look like this one.',
    intro:
      count === 1
        ? `bumpcheck read the changelogs for ${repo} and found 1 upgrade that will break existing code. It is listed here with what changed and the first thing to do.`
        : `bumpcheck read the changelogs for ${repo} and found ${count} upgrades that will break existing code. Each is listed here with what changed and the first thing to do.`,
    items: input.items.map(itemWords),
    report: { label: 'Open the full report', url: projectUrl },
    reason: isTest
      ? `You are getting this email because you pressed "Send me a test" on the settings page of ${repo} in bumpcheck. It was sent to the address you sign in with.`
      : `You are getting this email because email alerts are on for ${repo} in bumpcheck. It was sent to the address you sign in with. bumpcheck does not email you about the same verdict twice.`,
    unsubscribe: { label: 'Stop these emails for this project, no sign-in needed', url: input.unsubscribeUrl },
    settings: { label: 'Alert settings', url: `${projectUrl}/settings` },
    signature: 'bumpcheck',
  }
}

function itemWords(item: AlertItem): ItemWords {
  const more = item.changeCount - 1
  const changelogUrl = httpUrl(item.sourceUrl)
  // Each piece is made one line. In the text body a line break inside a
  // summary would let changelog text start a line of its own, and so write
  // something that looks like the email's own footer.
  return {
    packageName: singleLine(item.packageName),
    versions: singleLine(`${item.fromVersion} → ${item.toVersion}`),
    group: item.group === 'runtime' ? 'runtime dependency' : 'dev dependency',
    summary: singleLine(item.summary),
    whatToDoLabel: 'What to do first:',
    whatToDo: item.firstWhatToDo === null ? null : singleLine(item.firstWhatToDo),
    moreChanges:
      more <= 0 ? null : more === 1 ? '1 more change is listed in the report.' : `${more} more changes are listed in the report.`,
    changelog: changelogUrl === null ? null : { label: 'Changelog', url: changelogUrl },
  }
}

// -------------------------------------------------------------- text body

function renderText(words: Words): string {
  const lines: string[] = [words.heading, '='.repeat(Math.min(words.heading.length, 72)), '']
  if (words.testNote !== null) lines.push(words.testNote, '')
  lines.push(words.intro, '')

  for (const item of words.items) {
    // Two spaces between the parts of a line that the HTML shows as separate pieces.
    lines.push(`${item.packageName}  ${item.versions}  ${item.group}`)
    lines.push(`  ${item.summary}`)
    if (item.whatToDo !== null) lines.push(`  ${item.whatToDoLabel} ${item.whatToDo}`)
    if (item.moreChanges !== null) lines.push(`  ${item.moreChanges}`)
    if (item.changelog !== null) lines.push(`  ${textLink(item.changelog)}`)
    lines.push('')
  }

  lines.push(textLink(words.report), '')
  lines.push('-- ', words.reason, '', textLink(words.unsubscribe), textLink(words.settings), '', words.signature, '')
  return lines.join('\n')
}

function textLink(link: Link): string {
  return `${link.label}: ${link.url}`
}

// -------------------------------------------------------------- HTML body

/** Colours, light first. The dark values are applied by the style block in `renderHtml`. */
const COLOR = {
  page: '#f3f4f6',
  card: '#ffffff',
  border: '#d9dde3',
  text: '#1f2328',
  muted: '#59636e',
  breaking: '#b42318',
  button: '#1f2328',
  buttonText: '#ffffff',
  link: '#0b57d0',
} as const

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

/** Mail clients that honour this get a dark version; the rest keep the inline (light) colours. */
const DARK_STYLES = `
  @media (prefers-color-scheme: dark) {
    .bc-page { background: #0d1117 !important; }
    .bc-card { background: #161b22 !important; border-color: #30363d !important; }
    .bc-rule { border-color: #30363d !important; }
    .bc-text { color: #e6edf3 !important; }
    .bc-muted { color: #9198a1 !important; }
    .bc-breaking { color: #ff8182 !important; }
    .bc-link { color: #79b8ff !important; }
    .bc-button { background: #e6edf3 !important; color: #0d1117 !important; }
  }`

function renderHtml(words: Words): string {
  const e = escapeHtml
  const text = `font-family:${FONT};color:${COLOR.text};`
  const muted = `font-family:${FONT};color:${COLOR.muted};`

  const items = words.items
    .map(
      (item) => `
            <tr>
              <td class="bc-rule" style="padding:16px 24px;border-top:1px solid ${COLOR.border};">
                <div class="bc-text" style="font-family:${MONO};font-size:15px;line-height:22px;font-weight:bold;color:${COLOR.text};word-break:break-all;">${e(item.packageName)}</div>
                <div style="font-size:13px;line-height:20px;">
                  <span class="bc-breaking" style="font-family:${MONO};color:${COLOR.breaking};">${e(item.versions)}</span>
                  <span class="bc-muted" style="${muted}padding-left:8px;">${e(item.group)}</span>
                </div>
                <div class="bc-text" style="${text}font-size:14px;line-height:21px;padding-top:8px;">${e(item.summary)}</div>${
                  item.whatToDo === null
                    ? ''
                    : `
                <div class="bc-text" style="${text}font-size:14px;line-height:21px;padding-top:8px;"><strong>${e(item.whatToDoLabel)}</strong> ${e(item.whatToDo)}</div>`
                }${
                  item.moreChanges === null
                    ? ''
                    : `
                <div class="bc-muted" style="${muted}font-size:13px;line-height:20px;padding-top:8px;">${e(item.moreChanges)}</div>`
                }${
                  item.changelog === null
                    ? ''
                    : `
                <div style="font-family:${FONT};font-size:13px;line-height:20px;padding-top:8px;">${htmlLink(item.changelog)}</div>`
                }
              </td>
            </tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${e(words.subject)}</title>
<style>${DARK_STYLES}
</style>
</head>
<body class="bc-page" style="margin:0;padding:0;background:${COLOR.page};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${COLOR.page};">${e(words.items[0].summary)}</div>
<table role="presentation" class="bc-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.page};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td class="bc-card" style="background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td style="padding:24px 24px 16px 24px;">
                <h1 class="bc-text" style="${text}margin:0;font-size:20px;line-height:28px;font-weight:bold;">${e(words.heading)}</h1>${
                  words.testNote === null
                    ? ''
                    : `
                <p class="bc-muted" style="${muted}margin:12px 0 0 0;font-size:14px;line-height:21px;font-style:italic;">${e(words.testNote)}</p>`
                }
                <p class="bc-text" style="${text}margin:12px 0 0 0;font-size:14px;line-height:21px;">${e(words.intro)}</p>
              </td>
            </tr>${items}
            <tr>
              <td class="bc-rule" style="padding:20px 24px 24px 24px;border-top:1px solid ${COLOR.border};">
                <a class="bc-button" href="${e(words.report.url)}" style="display:inline-block;background:${COLOR.button};color:${COLOR.buttonText};font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;padding:10px 18px;border-radius:6px;">${e(words.report.label)}</a>
              </td>
            </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px 0 24px;">
            <p class="bc-muted" style="${muted}margin:0;font-size:12px;line-height:18px;">${e(words.reason)}</p>
            <p style="font-family:${FONT};margin:8px 0 0 0;font-size:12px;line-height:18px;">${htmlLink(words.unsubscribe)}</p>
            <p style="font-family:${FONT};margin:4px 0 0 0;font-size:12px;line-height:18px;">${htmlLink(words.settings)}</p>
            <p class="bc-muted" style="margin:12px 0 0 0;font-family:${MONO};font-size:12px;line-height:18px;color:${COLOR.muted};">${e(words.signature)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`
}

function htmlLink(link: Link): string {
  return `<a class="bc-link" href="${escapeHtml(link.url)}" style="color:${COLOR.link};text-decoration:underline;">${escapeHtml(link.label)}</a>`
}

// ------------------------------------------------------ untrusted values

/** Makes any text safe to put in HTML, between tags or inside a quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * One line of text: line breaks and other control characters become a
 * space. Used for anything that reaches the subject or a header, where a
 * line break would start a new header.
 */
export function singleLine(value: string): string {
  // Unicode classes: Cc is every control character, Zl and Zp the line and paragraph separators.
  return value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim()
}

/**
 * A URL for inside the angle brackets of a header: one line, and no
 * character that could end the bracket or start another value.
 */
function headerUrl(url: string): string {
  return singleLine(url).split(/[\s<>,]/)[0]
}

/** The URL, normalised, when it is an http or https one. Null for anything else. */
function httpUrl(value: string | null): string | null {
  if (value === null) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
