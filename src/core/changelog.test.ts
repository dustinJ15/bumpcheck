import { describe, expect, it } from 'vitest'
import { JUDGE } from '../config'
import { headingVersion, sliceChangelog, sliceReleases } from './changelog'

const range = { from: '4.0.0', to: '5.1.0' }

describe('headingVersion: the common heading styles', () => {
  it.each([
    ['1.2.3', '1.2.3'],
    ['v1.2.3', '1.2.3'],
    ['[1.2.3] - 2024-01-01', '1.2.3'],
    ['[1.2.3](https://github.com/a/b/compare/v1.2.2...v1.2.3) (2024-01-01)', '1.2.3'],
    ['1.2.3 (2024-01-01)', '1.2.3'],
    ['Version 1.2.3', '1.2.3'],
    ['Release v1.2.3', '1.2.3'],
    ['my-pkg@1.2.3', '1.2.3'],
    ['@scope/my-pkg@1.2.3', '1.2.3'],
    ['<small>1.2.3 (2024-01-01)</small>', '1.2.3'],
    ['**1.2.3**', '1.2.3'],
    ['2.0.0-beta.1', '2.0.0-beta.1'],
    ['1.2.3 / 2024-01-01', '1.2.3'],
  ])('%s -> %s', (text, version) => {
    expect(headingVersion(text)).toBe(version)
  })

  it.each(['Unreleased', 'Bug Fixes', 'Upgrading from 1.x to 2.0.0', '2024-01-01', '1.2'])(
    '%s is not a version heading',
    (text) => {
      expect(headingVersion(text)).toBeNull()
    },
  )
})

describe('sliceChangelog', () => {
  const keepAChangelog = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '- something not released',
    '',
    '## [5.2.0] - 2024-06-01',
    '- above the target',
    '',
    '## [5.1.0] - 2024-05-01',
    '### Added',
    '- the target release',
    '',
    '## [5.0.0] - 2024-01-01',
    '### Breaking',
    '- removed `app.del()`',
    '',
    '## [4.0.0] - 2020-01-01',
    '- the current release',
    '',
    '## [3.9.0] - 2019-01-01',
    '- older',
  ].join('\n')

  it('keeps only versions after current, up to and including the target, oldest first', () => {
    const sliced = sliceChangelog(keepAChangelog, range)
    expect(sliced.versions).toEqual(['5.0.0', '5.1.0'])
    expect(sliced.text).toContain('removed `app.del()`')
    expect(sliced.text).toContain('the target release')
    expect(sliced.text.indexOf('5.0.0')).toBeLessThan(sliced.text.indexOf('5.1.0'))
    expect(sliced.truncated).toBe(false)
  })

  it('excludes the current version and anything above the target (range edges)', () => {
    const sliced = sliceChangelog(keepAChangelog, range)
    expect(sliced.text).not.toContain('the current release')
    expect(sliced.text).not.toContain('above the target')
    expect(sliced.text).not.toContain('older')
    expect(sliced.text).not.toContain('not released')
  })

  it('includes prereleases between the two versions', () => {
    const text = '## 5.0.0\n- final\n\n## 5.0.0-beta.1\n- beta notes\n\n## 4.0.0\n- current'
    expect(sliceChangelog(text, range).versions).toEqual(['5.0.0-beta.1', '5.0.0'])
  })

  it('reads setext headings (History.md style)', () => {
    const history = [
      '5.0.0 / 2024-09-09',
      '==================',
      '',
      '  * remove `res.redirect("back")`',
      '',
      '4.21.0 / 2024-09-01',
      '===================',
      '',
      '  * older change',
    ].join('\n')
    const sliced = sliceChangelog(history, { from: '4.21.0', to: '5.0.0' })
    expect(sliced.versions).toEqual(['5.0.0'])
    expect(sliced.text).toContain('res.redirect')
    expect(sliced.text).not.toContain('older change')
  })

  it('reads conventional-changelog headings with compare links and v-prefixed headings', () => {
    const text = [
      '# [5.0.0](https://github.com/a/b/compare/v4.1.0...v5.0.0) (2024-01-01)',
      '### BREAKING CHANGES',
      '* dropped Node 16',
      '',
      '## v4.1.0',
      '* a feature',
    ].join('\n')
    const sliced = sliceChangelog(text, { from: '4.0.0', to: '5.0.0' })
    expect(sliced.versions).toEqual(['4.1.0', '5.0.0'])
    expect(sliced.text).toContain('dropped Node 16')
  })

  it('does not mistake a list item followed by a horizontal rule for a heading', () => {
    const text = ['## 5.0.0', '- Removed foo() (BREAKING)', '---', '## 4.0.0', '- current'].join('\n')
    const sliced = sliceChangelog(text, range)
    expect(sliced.versions).toEqual(['5.0.0'])
    expect(sliced.text).toContain('Removed foo() (BREAKING)')
  })

  it('keeps a section going past a horizontal rule between paragraphs', () => {
    const text = ['## 5.0.0', 'First note.', '', '---', '', 'Second note.', '## 4.0.0'].join('\n')
    expect(sliceChangelog(text, range).text).toContain('Second note.')
  })

  it('ignores headings inside fenced code blocks', () => {
    const text = ['## 5.0.0', '```sh', '# 9.9.9 not a heading', 'npm i b', '```', '- real note', '## 4.0.0'].join('\n')
    const sliced = sliceChangelog(text, range)
    expect(sliced.versions).toEqual(['5.0.0'])
    expect(sliced.text).toContain('real note')
  })

  it('returns empty text when no section is in range', () => {
    expect(sliceChangelog('## 3.0.0\n- old', range)).toEqual({ text: '', versions: [], truncated: false })
    expect(sliceChangelog('No version headings here at all.', range).text).toBe('')
  })

  it('cuts at the cap and reports that it did', () => {
    const long = `## 5.0.0\n${'x'.repeat(500)}\n\n## 4.0.0\n- current`
    const sliced = sliceChangelog(long, range, 100)
    expect(sliced.text).toHaveLength(100)
    expect(sliced.truncated).toBe(true)
    expect(sliced.text.startsWith('## 5.0.0')).toBe(true)
  })

  it('does not report a cut when the text fits exactly', () => {
    const text = '## 5.0.0\nabc'
    expect(sliceChangelog(text, range, text.length)).toMatchObject({ text, truncated: false })
  })

  it('uses the configured input cap by default', () => {
    const huge = `## 5.0.0\n${'y'.repeat(JUDGE.changelogInputCapChars * 2)}`
    const sliced = sliceChangelog(huge, range)
    expect(sliced.text).toHaveLength(JUDGE.changelogInputCapChars)
    expect(sliced.truncated).toBe(true)
  })
})

describe('sliceReleases', () => {
  const releases = [
    { tag: 'v5.2.0', name: 'v5.2.0', body: 'above target' },
    { tag: 'v5.1.0', name: 'v5.1.0', body: 'target notes' },
    { tag: 'v5.0.0', name: '5.0.0 — big one', body: 'breaking notes' },
    { tag: 'v4.0.0', name: 'v4.0.0', body: 'current notes' },
    { tag: 'nightly', name: 'Nightly', body: 'not a version' },
  ]

  it('selects in-range releases and concatenates them oldest first', () => {
    const sliced = sliceReleases(releases, range)
    expect(sliced.versions).toEqual(['5.0.0', '5.1.0'])
    expect(sliced.text).toBe('## 5.0.0 — big one\n\nbreaking notes\n\n## v5.1.0\n\ntarget notes')
  })

  it('skips tags that name a different package in a monorepo', () => {
    const mono = [
      { tag: 'my-pkg@5.0.0', body: 'mine' },
      { tag: 'other-pkg@5.0.0', body: 'not mine' },
    ]
    const sliced = sliceReleases(mono, range, 'my-pkg')
    expect(sliced.text).toContain('mine')
    expect(sliced.text).not.toContain('not mine')
  })

  it('handles a release with no body and cuts at the cap', () => {
    expect(sliceReleases([{ tag: 'v5.0.0', body: null }], range).text).toBe('## v5.0.0\n\n')
    const sliced = sliceReleases([{ tag: 'v5.0.0', body: 'z'.repeat(200) }], range, undefined, 50)
    expect(sliced).toMatchObject({ truncated: true })
    expect(sliced.text).toHaveLength(50)
  })
})
