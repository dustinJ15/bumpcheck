import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  listDependencies,
  pickTarget,
  readSpec,
  triage,
  triageDependency,
  type PublishedVersions,
} from './triage'

const published = (latest: string, versions: string[] = [latest]): PublishedVersions => ({ latest, versions })
const runtime = (name: string, declared: string) => ({ name, group: 'runtime' as const, declared })

describe('listDependencies', () => {
  it('reads dependencies and devDependencies only, runtime first', () => {
    const deps = listDependencies({
      devDependencies: { vitest: '^1.0.0' },
      dependencies: { express: '^4.18.0' },
      peerDependencies: { react: '^18.0.0' },
      optionalDependencies: { fsevents: '^2.0.0' },
    })
    expect(deps).toEqual([
      { name: 'express', group: 'runtime', declared: '^4.18.0' },
      { name: 'vitest', group: 'dev', declared: '^1.0.0' },
    ])
  })

  it('reports a package listed in both blocks once, as runtime', () => {
    const deps = listDependencies({ dependencies: { zod: '^3.0.0' }, devDependencies: { zod: '^3.1.0' } })
    expect(deps).toEqual([{ name: 'zod', group: 'runtime', declared: '^3.0.0' }])
  })

  it('ignores a manifest or block that is not an object, and non-string specs', () => {
    expect(listDependencies(null)).toEqual([])
    expect(listDependencies([])).toEqual([])
    expect(listDependencies({ dependencies: ['express'] })).toEqual([])
    expect(listDependencies({ dependencies: { a: 1, b: '^1.0.0' } })).toEqual([
      { name: 'b', group: 'runtime', declared: '^1.0.0' },
    ])
  })
})

describe('readSpec: current version is the lowest the range allows', () => {
  it.each([
    ['^1.2.3', '1.2.3'],
    ['~1.2.3', '1.2.3'],
    ['1.2.3', '1.2.3'],
    ['=1.2.3', '1.2.3'],
    ['v1.2.3', '1.2.3'],
    ['>=1.2.3 <2', '1.2.3'],
    ['1.x', '1.0.0'],
    ['1', '1.0.0'],
    ['1.2.3 - 2.0.0', '1.2.3'],
    ['^1 || ^2', '1.0.0'],
    ['^0.4.0', '0.4.0'],
  ])('%s -> %s', (declared, current) => {
    expect(readSpec(declared)).toEqual({ kind: 'range', current })
  })

  it.each([
    ['git+https://github.com/a/b.git', 'git'],
    ['git://github.com/a/b.git', 'git'],
    ['github:a/b', 'git'],
    ['a/b', 'git'],
    ['a/b#v1.0.0', 'git'],
    ['https://example.com/pkg.tgz', 'url'],
    ['file:../pkg', 'local'],
    ['link:../pkg', 'local'],
    ['./pkg', 'local'],
    ['../pkg', 'local'],
    ['workspace:*', 'workspace'],
    ['workspace:^1.0.0', 'workspace'],
    ['npm:other@^1.0.0', 'alias'],
    ['*', 'unbounded'],
    ['', 'unbounded'],
    ['x', 'unbounded'],
    ['latest', 'tag'],
    ['next', 'tag'],
    ['>2 <1', 'invalid-range'],
    ['^^1', 'invalid-range'],
  ])('%s is not checked (%s)', (declared, reason) => {
    expect(readSpec(declared)).toEqual({ kind: 'not-checked', reason })
  })
})

describe('pickTarget: the latest tag, prereleases ignored', () => {
  it('uses the latest tag when it is stable', () => {
    expect(pickTarget(published('5.1.0', ['4.0.0', '5.1.0', '6.0.0-beta.1']))).toBe('5.1.0')
  })

  it('falls back to the highest stable version when latest is a prerelease', () => {
    expect(pickTarget(published('6.0.0-rc.1', ['4.0.0', '5.2.1', '6.0.0-rc.1']))).toBe('5.2.1')
  })

  it('returns null when only prereleases exist', () => {
    expect(pickTarget(published('1.0.0-alpha.1', ['1.0.0-alpha.0', '1.0.0-alpha.1']))).toBeNull()
  })
})

describe('compareVersions', () => {
  it.each([
    ['1.2.3', '1.2.3', 'up-to-date'],
    ['1.2.3', '1.2.4', 'patch'],
    ['1.2.3', '1.3.0', 'minor'],
    ['1.2.3', '2.0.0', 'major'],
    ['4.17.1', '5.1.0', 'major'],
    // 0.x: a minor bump counts as major.
    ['0.4.0', '0.5.0', 'major'],
    ['0.4.0', '0.4.7', 'patch'],
    ['0.4.0', '1.0.0', 'major'],
    // Declared range is ahead of latest: nothing to upgrade.
    ['3.0.0', '2.9.0', 'up-to-date'],
    ['1.5.0', '1.4.0', 'up-to-date'],
    // Prerelease tags on the current version are ignored.
    ['2.0.0-beta.1', '2.0.0', 'up-to-date'],
    ['2.0.0-beta.1', '3.0.0', 'major'],
  ])('%s -> %s is %s', (current, target, expected) => {
    expect(compareVersions(current, target)).toBe(expected)
  })
})

describe('triageDependency', () => {
  it('classifies a major upgrade with its current and target versions', () => {
    expect(triageDependency(runtime('express', '^4.17.1'), published('5.1.0'))).toEqual({
      name: 'express',
      group: 'runtime',
      declared: '^4.17.1',
      current: '4.17.1',
      target: '5.1.0',
      triage: 'major',
    })
  })

  it('marks an unpublished package as not checked', () => {
    expect(triageDependency(runtime('private-thing', '^1.0.0'), null)).toMatchObject({
      triage: 'not-checked',
      notCheckedReason: 'unpublished',
      current: null,
      target: null,
    })
  })

  it('marks a package with only prereleases as not checked', () => {
    expect(triageDependency(runtime('early', '^0.1.0'), published('1.0.0-rc.1'))).toMatchObject({
      triage: 'not-checked',
      notCheckedReason: 'no-stable-release',
    })
  })

  it('does not consult the registry for a git dependency', () => {
    expect(triageDependency(runtime('forked', 'github:me/forked'), published('9.9.9'))).toMatchObject({
      triage: 'not-checked',
      notCheckedReason: 'git',
    })
  })
})

describe('triage', () => {
  it('lists every dependency, including the unscannable ones', () => {
    const results = triage(
      {
        dependencies: { express: '^4.18.0', chalk: '^4.1.0', local: 'file:../local', zod: '^3.22.0' },
        devDependencies: { typescript: '~5.4.0', vitest: '^1.6.0' },
      },
      {
        express: published('5.1.0'),
        chalk: published('5.4.1'),
        zod: published('3.23.8'),
        typescript: published('5.4.5'),
        vitest: published('1.6.0'),
      },
    )
    expect(results.map((r) => [r.name, r.group, r.triage])).toEqual([
      ['express', 'runtime', 'major'],
      ['chalk', 'runtime', 'major'],
      ['local', 'runtime', 'not-checked'],
      ['zod', 'runtime', 'minor'],
      ['typescript', 'dev', 'patch'],
      ['vitest', 'dev', 'up-to-date'],
    ])
  })
})
