/**
 * The alert composer: subject, HTML, text and headers for one alert email.
 * Pure, so everything here runs without a mailer.
 */

import { describe, expect, it } from 'vitest'
import { composeAlertEmail, SAMPLE_ALERT_ITEM, type AlertEmailInput, type AlertItem } from './alert-email'

const ORIGIN = 'https://bumpcheck.example'
const UNSUBSCRIBE_URL = `${ORIGIN}/api/unsubscribe?token=abc.def`

const router: AlertItem = {
  verdictKey: 'router@4->5.1',
  packageName: 'router',
  group: 'runtime',
  fromVersion: '4.18.0',
  toVersion: '5.1.0',
  summary: 'Two request and routing helpers were removed in 5.0.0.',
  changeCount: 2,
  firstWhatToDo: 'Call `app.delete()` instead of `app.del()`.',
  sourceUrl: 'https://github.com/acme/router/blob/HEAD/CHANGELOG.md',
}

const runner: AlertItem = {
  verdictKey: 'test-runner@1->3.0',
  packageName: '@acme/test-runner',
  group: 'dev',
  fromVersion: '1.6.0',
  toVersion: '3.0.0',
  summary: 'The config file format changed.',
  changeCount: 1,
  firstWhatToDo: 'Rename `runner.json` to `runner.config.js`.',
  sourceUrl: null,
}

function input(overrides: Partial<AlertEmailInput> = {}): AlertEmailInput {
  return {
    kind: 'alert',
    project: { id: 'project-1', repoOwner: 'dustin', repoName: 'app' },
    items: [router, runner],
    appOrigin: ORIGIN,
    unsubscribeUrl: UNSUBSCRIBE_URL,
    ...overrides,
  }
}

function compose(overrides: Partial<AlertEmailInput> = {}) {
  const email = composeAlertEmail(input(overrides))
  if (email === null) throw new Error('expected an email')
  return email
}

// ----------------------------------------------- reading an email in a test

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** What a person reading the HTML sees: the text between the tags, entities decoded. */
function visibleText(html: string): string {
  const body = html.replace(/<head>[\s\S]*<\/head>/, '').replace(/<[^>]+>/g, ' ')
  return squash(body.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]))
}

/** Every link target in the HTML, entities decoded. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]))
}

/**
 * The text body as pieces of content: each line, split where the composer
 * put two or more spaces, with a trailing ": <url>" taken off as a link.
 * Lines that are only decoration (a rule of = or -) are dropped.
 */
function textPieces(text: string): { words: string[]; urls: string[] } {
  const words: string[] = []
  const urls: string[] = []
  for (const line of text.split('\n')) {
    for (const piece of line.split(/\s{2,}/)) {
      const link = /^(.*?):? ?(https?:\/\/\S+)$/.exec(piece.trim())
      const rest = link ? link[1] : piece
      if (link) urls.push(link[2])
      if (/[A-Za-z0-9]/.test(rest)) words.push(squash(rest))
    }
  }
  return { words, urls }
}

// ------------------------------------------------------------------ tests

describe('composeAlertEmail: nothing to send', () => {
  it('returns null when there are no verdicts to tell the user about', () => {
    expect(composeAlertEmail(input({ items: [] }))).toBeNull()
  })

  it('returns null for a test email with no items too: the caller supplies the example', () => {
    expect(composeAlertEmail(input({ kind: 'test', items: [] }))).toBeNull()
  })
})

describe('composeAlertEmail: subject', () => {
  it('names the repo and the count', () => {
    expect(compose().subject).toBe('bumpcheck: 2 new breaking upgrades in dustin/app')
  })

  it('uses the singular for one', () => {
    expect(compose({ items: [router] }).subject).toBe('bumpcheck: 1 new breaking upgrade in dustin/app')
  })

  it('marks a test email as a test', () => {
    expect(compose({ kind: 'test' }).subject).toBe('[Test] bumpcheck: 2 new breaking upgrades in dustin/app')
  })

  it('cannot be used to add a header: line breaks in the repo name are removed', () => {
    const email = compose({ project: { id: 'p', repoOwner: 'dustin', repoName: 'app\r\nBcc: evil@example.test' } })
    expect(email.subject).not.toMatch(/[\r\n]/)
    expect(email.subject).toBe('bumpcheck: 2 new breaking upgrades in dustin/app Bcc: evil@example.test')
  })
})

describe('composeAlertEmail: content', () => {
  it('lists each package with its version jump, summary and first "what to do" note', () => {
    const { text } = compose()
    for (const item of [router, runner]) {
      expect(text).toContain(item.packageName)
      expect(text).toContain(`${item.fromVersion} → ${item.toVersion}`)
      expect(text).toContain(item.summary)
      expect(text).toContain(item.firstWhatToDo)
    }
    expect(text).toContain('runtime dependency')
    expect(text).toContain('dev dependency')
  })

  it('keeps the order it was given: the caller puts runtime dependencies first', () => {
    const { text } = compose()
    expect(text.indexOf('router')).toBeLessThan(text.indexOf('@acme/test-runner'))
  })

  it('says how many more changes the report lists, and nothing when there is only one', () => {
    const { text } = compose()
    expect(text).toContain('1 more change is listed in the report.')
    expect(compose({ items: [{ ...router, changeCount: 4 }] }).text).toContain('3 more changes are listed in the report.')
    expect(compose({ items: [runner] }).text).not.toContain('more change')
  })

  it('links to the report, the changelog, the alert settings and the unsubscribe page, all absolute', () => {
    const email = compose()
    const links = hrefs(email.html)
    expect(links).toContain(`${ORIGIN}/projects/project-1`)
    expect(links).toContain(`${ORIGIN}/projects/project-1/settings`)
    expect(links).toContain(router.sourceUrl)
    expect(links).toContain(UNSUBSCRIBE_URL)
    for (const link of links) expect(link).toMatch(/^https:\/\//)
    expect(email.text).toContain(`${ORIGIN}/projects/project-1`)
    expect(email.text).toContain(UNSUBSCRIBE_URL)
  })

  it('uses the origin it is given for its own links, whatever that is', () => {
    const email = compose({ appOrigin: 'http://127.0.0.1:5173', unsubscribeUrl: 'http://127.0.0.1:5173/api/unsubscribe?token=t' })
    expect(hrefs(email.html)).toContain('http://127.0.0.1:5173/projects/project-1')
    expect(email.html).not.toContain(ORIGIN)
    expect(email.text).not.toContain(ORIGIN)
  })

  it('says why the reader got it and how to stop it', () => {
    const { text } = compose()
    expect(text).toContain('You are getting this email because email alerts are on for dustin/app')
    expect(text).toContain('the address you sign in with')
    expect(text).toMatch(/Stop these emails.*no sign-in/)
  })

  it('a test email says it is a test and that the user asked for it', () => {
    const real = compose({ kind: 'test' })
    expect(real.text).toContain('This is a test email')
    expect(real.text).toContain('You are getting this email because you pressed "Send me a test"')
    expect(real.text).not.toContain('made-up example')
    expect(compose().text).not.toContain('This is a test email')
  })

  it('a test email for a project with nothing breaking shows the built-in example and says it is made up', () => {
    const email = compose({ kind: 'test', items: [SAMPLE_ALERT_ITEM], sample: true })
    expect(email.text).toContain('made-up example')
    expect(email.text).toContain(SAMPLE_ALERT_ITEM.packageName)
    expect(email.verdictKeys).toEqual([])
  })

  it('reports the verdict keys it covered, for the send log', () => {
    expect(compose().verdictKeys).toEqual(['router@4->5.1', 'test-runner@1->3.0'])
  })
})

describe('composeAlertEmail: HTML and text carry the same content', () => {
  for (const [name, overrides] of [
    ['an alert', {}],
    ['a test email', { kind: 'test' }],
    ['a test email with the example', { kind: 'test', items: [SAMPLE_ALERT_ITEM], sample: true }],
  ] as Array<[string, Partial<AlertEmailInput>]>) {
    it(`${name}: every piece of the text body is in the HTML, and every link`, () => {
      const email = compose(overrides)
      const seen = visibleText(email.html)
      const pieces = textPieces(email.text)
      expect(pieces.words.length).toBeGreaterThan(8)
      for (const piece of pieces.words) expect(seen, `missing from the HTML: ${piece}`).toContain(piece)
      const links = hrefs(email.html)
      for (const url of pieces.urls) expect(links, `not a link in the HTML: ${url}`).toContain(url)
    })

    it(`${name}: everything the HTML shows is in the text body, and every link`, () => {
      const email = compose(overrides)
      const text = squash(email.text)
      // The HTML, cut into the runs of text between its tags.
      const runs = email.html
        .replace(/<head>[\s\S]*<\/head>/, '')
        .split(/<[^>]+>/)
        .map((run) => squash(run.replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])))
        .filter((run) => /[A-Za-z0-9]/.test(run))
      expect(runs.length).toBeGreaterThan(8)
      for (const run of runs) expect(text, `missing from the text body: ${run}`).toContain(run)
      for (const url of hrefs(email.html)) expect(email.text, `link missing from the text body: ${url}`).toContain(url)
    })
  }
})

describe('composeAlertEmail: untrusted text', () => {
  // Package names, summaries and notes come from changelogs through the judge.
  const hostile: AlertItem = {
    verdictKey: 'evil@1->2.0',
    packageName: '<img src=x onerror=alert(1)>',
    group: 'runtime',
    fromVersion: '1.0.0"><script>alert(2)</script>',
    toVersion: '2.0.0',
    summary: '</td></tr></table><script>alert(3)</script> Tom & Jerry said "hi"',
    changeCount: 1,
    firstWhatToDo: "Run <b onmouseover='alert(4)'>this</b>",
    sourceUrl: 'https://example.test/log"><script>alert(5)</script>',
  }

  it('escapes every dynamic value in the HTML', () => {
    const { html } = compose({ items: [hostile] })
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/<b /i)
    expect(html).not.toContain("onmouseover='")
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;&lt;script&gt;alert(3)&lt;/script&gt; Tom &amp; Jerry said &quot;hi&quot;')
    expect(html).toContain('Run &lt;b onmouseover=&#39;alert(4)&#39;&gt;this&lt;/b&gt;')
  })

  it('still shows the hostile text as text, the same in both bodies', () => {
    const email = compose({ items: [hostile] })
    expect(email.text).toContain(hostile.packageName)
    expect(email.text).toContain(hostile.summary)
    expect(visibleText(email.html)).toContain(hostile.packageName)
    expect(visibleText(email.html)).toContain(squash(hostile.summary))
  })

  it('untrusted text cannot start a line of its own in either body, so it cannot forge a footer link', () => {
    const forged = 'Stop these emails for this project, no sign-in needed: https://evil.example/x'
    const email = compose({
      items: [{ ...router, packageName: `pkg\n${forged}`, summary: `Minor change.\r\n\r\n${forged}`, firstWhatToDo: `Nothing.\u2028${forged}` }],
    })
    const lines = email.text.split(/\r\n|[\n\r\u2028\u2029]/)
    expect(lines.filter((line) => line.trim().startsWith('Stop these emails'))).toHaveLength(1)
    expect(email.text).toContain(`  Minor change. ${forged}`)
    expect(email.html).not.toMatch(/Minor change\.[\r\n]/)
  })

  it('escapes the repo name too', () => {
    const { html } = compose({ project: { id: 'p', repoOwner: 'a<b', repoName: 'c&d"e' } })
    expect(html).toContain('a&lt;b/c&amp;d&quot;e')
    expect(html).not.toContain('a<b/c')
  })

  it('a changelog link cannot break out of its attribute', () => {
    const { html } = compose({ items: [hostile] })
    // No link target contains a raw quote or angle bracket.
    for (const match of html.matchAll(/href="([^"]*)"/g)) expect(match[1]).not.toMatch(/[<>]/)
    expect(html).not.toContain('"><script>')
  })

  it('writes an ampersand in a link target as an entity, in every kind of link', () => {
    const email = compose({
      items: [{ ...router, sourceUrl: 'https://example.test/log?a=1&b=2' }],
      unsubscribeUrl: `${UNSUBSCRIBE_URL}&x=1`,
    })
    expect(email.html).toContain('href="https://example.test/log?a=1&amp;b=2"')
    expect(email.html).toContain(`href="${UNSUBSCRIBE_URL}&amp;x=1"`)
    expect(email.html).not.toMatch(/href="[^"]*&(?!amp;)/)
  })

  it('an unsubscribe link cannot break out of its attribute either', () => {
    const { html } = compose({ unsubscribeUrl: 'https://example.test/u?token=a"><script>alert(6)</script>' })
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('href="https://example.test/u?token=a&quot;&gt;&lt;script&gt;alert(6)&lt;/script&gt;"')
  })

  it('leaves out a changelog link that is not http or https', () => {
    for (const sourceUrl of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'not a url', '']) {
      const email = compose({ items: [{ ...router, sourceUrl }] })
      expect(email.html).not.toContain('javascript:')
      expect(email.html).not.toContain('data:text')
      expect(email.html).not.toContain('Changelog')
      expect(email.text).not.toContain('Changelog')
    }
  })

  it('escapes its own link targets when the project id is hostile', () => {
    const email = compose({ project: { id: 'x"><script>alert(1)</script>', repoOwner: 'dustin', repoName: 'app' } })
    expect(email.html).not.toMatch(/<script/i)
    expect(hrefs(email.html)).toContain(`${ORIGIN}/projects/${encodeURIComponent('x"><script>alert(1)</script>')}`)
  })
})

describe('composeAlertEmail: headers', () => {
  it('carries the one-click unsubscribe pair (RFC 8058)', () => {
    expect(compose().headers).toEqual({
      'List-Unsubscribe': `<${UNSUBSCRIBE_URL}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
  })

  it('a test email carries the same headers, so the test shows the real thing', () => {
    expect(compose({ kind: 'test' }).headers).toEqual(compose().headers)
  })

  it('no header value can contain a line break or close its own bracket', () => {
    const email = compose({ unsubscribeUrl: `${UNSUBSCRIBE_URL}\r\nBcc: evil@example.test>, <https://evil.test` })
    for (const value of Object.values(email.headers)) expect(value).not.toMatch(/[\r\n]/)
    const value = email.headers['List-Unsubscribe']
    expect(value.startsWith('<') && value.endsWith('>')).toBe(true)
    expect(value.slice(1, -1)).not.toMatch(/[<> ]/)
  })
})

describe('composeAlertEmail: the HTML is safe for mail clients', () => {
  it('loads nothing from anywhere: no images, fonts, scripts or stylesheets', () => {
    const { html } = compose()
    expect(html).not.toMatch(/<img|<script|<link|@import|url\(|@font-face/i)
  })

  it('declares both colour schemes and puts its layout in inline styles', () => {
    const { html } = compose()
    expect(html).toContain('<meta name="color-scheme" content="light dark">')
    expect(html).toContain('prefers-color-scheme: dark')
    expect(html).toMatch(/<table role="presentation"[^>]*style="/)
  })
})
