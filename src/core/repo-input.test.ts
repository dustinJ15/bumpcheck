import { describe, expect, it } from 'vitest'
import { INVALID_REPO_INPUT_MESSAGE, parseRepoInput } from './repo-input'

function parsed(text: string) {
  const result = parseRepoInput(text)
  if (!result.ok) throw new Error(`expected "${text}" to parse, got: ${result.message}`)
  return `${result.repo.owner}/${result.repo.repo}`
}

describe('parseRepoInput: owner/repo', () => {
  it('reads owner/repo', () => {
    expect(parseRepoInput('expressjs/express')).toEqual({ ok: true, repo: { owner: 'expressjs', repo: 'express' } })
  })

  it('trims spaces and a trailing slash', () => {
    expect(parsed('  expressjs/express/  ')).toBe('expressjs/express')
  })

  it('lowercases, so Foo/Bar and foo/bar are the same repo', () => {
    expect(parsed('DustinJ15/Bumpcheck-Example')).toBe('dustinj15/bumpcheck-example')
    expect(parsed('Foo/Bar')).toBe(parsed('foo/bar'))
  })

  it('keeps dots, dashes and underscores in the repo name', () => {
    expect(parsed('vercel/next.js')).toBe('vercel/next.js')
    expect(parsed('some-org/my_repo-2')).toBe('some-org/my_repo-2')
  })

  it('drops a .git suffix', () => {
    expect(parsed('expressjs/express.git')).toBe('expressjs/express')
  })
})

describe('parseRepoInput: GitHub URLs', () => {
  it.each([
    'https://github.com/expressjs/express',
    'http://github.com/expressjs/express',
    'https://www.github.com/expressjs/express',
    'github.com/expressjs/express',
    'https://github.com/expressjs/express/',
    'https://github.com/expressjs/express.git',
    'https://github.com/expressjs/express/tree/master/lib',
    'https://github.com/expressjs/express/blob/master/package.json',
    'https://github.com/expressjs/express?tab=readme-ov-file',
    'https://github.com/expressjs/express#readme',
    'git@github.com:expressjs/express.git',
  ])('reads %s', (url) => {
    expect(parsed(url)).toBe('expressjs/express')
  })
})

describe('parseRepoInput: junk is refused with one message', () => {
  it.each([
    '',
    '   ',
    'express',
    'expressjs/',
    '/express',
    'a/b/c',
    'expressjs express',
    'https://gitlab.com/expressjs/express',
    'https://example.com/expressjs/express',
    'https://github.com/expressjs',
    'https://github.com/',
    '-bad/repo',
    'bad-/repo',
    'ow--ner/../..',
    'owner/..',
    'owner/.',
    'owner/re po',
    'owner/repo$',
    `${'a'.repeat(40)}/repo`,
    `owner/${'r'.repeat(101)}`,
  ])('refuses %j', (text) => {
    expect(parseRepoInput(text)).toEqual({ ok: false, message: INVALID_REPO_INPUT_MESSAGE })
  })

  it('refuses input that is not text', () => {
    expect(parseRepoInput(undefined)).toEqual({ ok: false, message: INVALID_REPO_INPUT_MESSAGE })
    expect(parseRepoInput(42)).toEqual({ ok: false, message: INVALID_REPO_INPUT_MESSAGE })
  })
})
