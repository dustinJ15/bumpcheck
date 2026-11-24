/**
 * The pure helpers inside the real npm and GitHub implementations: how a URL
 * is built and how a response is read. No test here (or anywhere) calls npm,
 * GitHub or Claude; the classes themselves are exercised only by the
 * supervisor's live check.
 */

import { describe, expect, it } from 'vitest'
import { isNotFound, readFileText, readReleases, readReleasesAnswer, readRepoInfo, releasesApiUrl } from './github-source-host'
import { npmDocumentUrl, npmLatestUrl, parseRepositoryField } from './npm-registry'
import { EMAIL_SEND_ENDPOINT, emailSendInput, readEmailSendReply } from './email-mailer'

describe('npm registry URLs', () => {
  it('builds the latest-version URL', () => {
    expect(npmLatestUrl('express')).toBe('https://registry.npmjs.org/express/latest')
  })

  it('keeps the @ of a scoped name and encodes its slash', () => {
    expect(npmDocumentUrl('@types/node')).toBe('https://registry.npmjs.org/@types%2Fnode')
    expect(npmLatestUrl('@types/node')).toBe('https://registry.npmjs.org/@types%2Fnode/latest')
  })

  it('cannot be steered to another path by a strange name', () => {
    expect(npmLatestUrl('../../-/whoami')).toBe('https://registry.npmjs.org/..%2F..%2F-%2Fwhoami/latest')
  })
})

describe('parseRepositoryField', () => {
  it.each([
    ['expressjs/express'],
    ['github:expressjs/express'],
    ['https://github.com/expressjs/express'],
    ['https://github.com/expressjs/express.git'],
    ['git+https://github.com/expressjs/express.git'],
    ['git://github.com/expressjs/express.git'],
    ['git@github.com:expressjs/express.git'],
    ['git+ssh://git@github.com/expressjs/express.git'],
    ['https://github.com/expressjs/express/tree/master'],
  ])('reads the string form %s', (text) => {
    expect(parseRepositoryField(text)).toEqual({ owner: 'expressjs', repo: 'express' })
  })

  it('reads the object form', () => {
    expect(parseRepositoryField({ type: 'git', url: 'git+https://github.com/colinhacks/zod.git' })).toEqual({
      owner: 'colinhacks',
      repo: 'zod',
    })
  })

  it('reads a monorepo subfolder', () => {
    expect(
      parseRepositoryField({ type: 'git', url: 'https://github.com/babel/babel.git', directory: 'packages/babel-core' }),
    ).toEqual({ owner: 'babel', repo: 'babel', directory: 'packages/babel-core' })
    expect(
      parseRepositoryField({ url: 'https://github.com/babel/babel.git', directory: './packages/babel-core/' }),
    ).toEqual({ owner: 'babel', repo: 'babel', directory: 'packages/babel-core' })
  })

  it('ignores a subfolder that climbs out of the repo', () => {
    expect(parseRepositoryField({ url: 'https://github.com/a/b', directory: '../../etc' })).toEqual({
      owner: 'a',
      repo: 'b',
    })
  })

  it('is null when there is no repository or it is not on GitHub', () => {
    expect(parseRepositoryField(undefined)).toBeNull()
    expect(parseRepositoryField(null)).toBeNull()
    expect(parseRepositoryField({})).toBeNull()
    expect(parseRepositoryField(42)).toBeNull()
    expect(parseRepositoryField('https://gitlab.com/group/project.git')).toBeNull()
    expect(parseRepositoryField('gitlab:group/project')).toBeNull()
    expect(parseRepositoryField({ type: 'git', url: 'https://bitbucket.org/a/b' })).toBeNull()
  })
})

describe('GitHub integration responses', () => {
  it('reads the default branch in either spelling', () => {
    expect(readRepoInfo({ default_branch: 'main', private: false })).toEqual({ defaultBranch: 'main' })
    expect(readRepoInfo({ defaultBranch: 'trunk' })).toEqual({ defaultBranch: 'trunk' })
  })

  it('treats a private repo as not found', () => {
    expect(readRepoInfo({ default_branch: 'main', private: true })).toBeNull()
  })

  it('throws on repository data it does not understand, instead of guessing', () => {
    expect(() => readRepoInfo('nope')).toThrow()
    expect(() => readRepoInfo({ name: 'express' })).toThrow()
  })

  it('decodes a base64 file, including line breaks in the encoding and non-ASCII text', () => {
    const text = '{"name":"café"}\n'
    const base64 = Buffer.from(text, 'utf8').toString('base64')
    const wrapped = `${base64.slice(0, 8)}\n${base64.slice(8)}\n`
    expect(readFileText({ type: 'file', encoding: 'base64', content: wrapped })).toBe(text)
  })

  it('accepts plain text content', () => {
    expect(readFileText('{"a":1}')).toBe('{"a":1}')
    expect(readFileText({ type: 'file', encoding: 'utf-8', content: '{"a":1}' })).toBe('{"a":1}')
  })

  it('is null when the path is a directory, not a file', () => {
    expect(readFileText([{ name: 'package.json' }])).toBeNull()
    expect(readFileText({ type: 'dir' })).toBeNull()
  })

  it('throws on file data it does not understand', () => {
    expect(() => readFileText(42)).toThrow()
    expect(() => readFileText({ type: 'file' })).toThrow()
  })

  it('recognises "not found" from a failed call', () => {
    expect(isNotFound({ error: 'Request failed (404)', status: 404 })).toBe(true)
    expect(isNotFound({ error: 'Not Found' })).toBe(true)
    expect(isNotFound({ error: 'Repository not found', status: 502 })).toBe(true)
    expect(isNotFound({ error: 'Insufficient credits', status: 402 })).toBe(false)
    expect(isNotFound({ error: 'Request failed (500)', status: 500 })).toBe(false)
  })
})

describe('the Releases fallback', () => {
  const body = [
    { tag_name: 'v2.0.0', name: 'Two', body: 'Breaking things.' },
    { tag_name: 'core@2.0.0', name: null, body: 'Core notes.' },
    { tag_name: 'v3.0.0-draft', name: 'Draft', body: 'Not out yet.', draft: true },
    { name: 'no tag' },
    'junk',
  ]

  it('builds the public API URL', () => {
    expect(releasesApiUrl({ owner: 'expressjs', repo: 'express' })).toBe(
      'https://api.github.com/repos/expressjs/express/releases?per_page=100',
    )
  })

  it('reads releases, skipping drafts and junk', () => {
    expect(readReleases(body, { owner: 'a', repo: 'b' })).toEqual([
      { tag: 'v2.0.0', name: 'Two', body: 'Breaking things.' },
      { tag: 'core@2.0.0', name: null, body: 'Core notes.' },
    ])
  })

  it('for a monorepo package keeps only pkg@version tags, which name their package', () => {
    expect(readReleases(body, { owner: 'a', repo: 'b', directory: 'packages/core' })).toEqual([
      { tag: 'core@2.0.0', name: null, body: 'Core notes.' },
    ])
  })

  it('is empty for anything that is not a list (an error body, say)', () => {
    expect(readReleases({ message: 'API rate limit exceeded' }, { owner: 'a', repo: 'b' })).toEqual([])
  })

  describe('telling "no releases" from "GitHub refused"', () => {
    const source = { owner: 'a', repo: 'b' }

    it('is "found" for a list with releases in it', () => {
      expect(readReleasesAnswer(200, body, source)).toEqual({
        status: 'found',
        releases: readReleases(body, source),
        url: 'https://github.com/a/b/releases',
      })
    })

    it('is "none" for an empty list, and for a repo GitHub does not know', () => {
      expect(readReleasesAnswer(200, [], source)).toEqual({ status: 'none' })
      expect(readReleasesAnswer(404, { message: 'Not Found' }, source)).toEqual({ status: 'none' })
    })

    it.each([403, 429, 500, 503])('is "refused" for status %i: that says nothing about the package', (status) => {
      expect(readReleasesAnswer(status, { message: 'API rate limit exceeded' }, source)).toEqual({ status: 'refused' })
    })

    it('is "refused" for a 200 whose body is not a list', () => {
      expect(readReleasesAnswer(200, { message: 'what' }, source)).toEqual({ status: 'refused' })
      expect(readReleasesAnswer(200, null, source)).toEqual({ status: 'refused' })
    })
  })
})

describe('the email integration call', () => {
  // The catalog's input schema for email/send (deepspace 0.44.2): to and
  // subject are required; html, text, reply_to and headers are accepted;
  // a "from" is ignored by the platform.
  const message = {
    to: 'dustin@example.test',
    subject: 'bumpcheck: 1 new breaking upgrade in dustin/app',
    html: '<p>hello</p>',
    text: 'hello',
    headers: { 'List-Unsubscribe': '<https://bumpcheck.example/api/unsubscribe?token=a.b>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }

  it('goes to email/send', () => {
    expect(EMAIL_SEND_ENDPOINT).toBe('email/send')
  })

  it('passes the recipient, subject, both bodies and the headers through', () => {
    expect(emailSendInput(message)).toEqual({
      to: 'dustin@example.test',
      subject: message.subject,
      html: '<p>hello</p>',
      text: 'hello',
      headers: message.headers,
    })
  })

  it('never names a sender: the platform always sends from its own address', () => {
    expect(Object.keys(emailSendInput(message))).not.toContain('from')
  })

  it('passes a reply-to through as reply_to when the message has one, and leaves it out otherwise', () => {
    expect(emailSendInput({ ...message, replyTo: 'help@example.test' })).toMatchObject({ reply_to: 'help@example.test' })
    expect(Object.keys(emailSendInput(message))).not.toContain('reply_to')
  })

  it('sends to exactly one address: no cc, no bcc, and "to" is a single string', () => {
    const input = emailSendInput(message)
    expect(typeof input.to).toBe('string')
    expect(Object.keys(input)).not.toContain('cc')
    expect(Object.keys(input)).not.toContain('bcc')
  })

  it('reads a successful reply as sent', () => {
    expect(readEmailSendReply({ success: true, data: { id: 'abc' } })).toEqual({ ok: true })
  })

  it('reads a failed reply as a failure with the reason, never as sent', () => {
    expect(readEmailSendReply({ success: false, error: 'Rate limit exceeded', status: 429 })).toEqual({ ok: false, error: 'Rate limit exceeded' })
    expect(readEmailSendReply({ success: false, error: '' })).toEqual({ ok: false, error: 'The email service refused the message.' })
  })
})
