import { describe, expect, it } from 'vitest'
import type { DependencyGroup, DependencyResult, TriageClass, Verdict, VerdictLabel, VerdictStatus } from './model'
import {
  addReviewedKey,
  buildReport,
  countUnreviewedBreaking,
  isReviewable,
  removeReviewedKey,
  rowState,
  sectionOf,
  SECTION_ORDER,
  type Report,
} from './report'
import { verdictKey } from './verdict'

function dep(
  name: string,
  triage: TriageClass,
  options: { group?: DependencyGroup; verdictKey?: string } = {},
): DependencyResult {
  const checked = triage !== 'not-checked'
  return {
    name,
    group: options.group ?? 'runtime',
    declared: '^1.0.0',
    current: checked ? '1.0.0' : null,
    target: checked ? '2.0.0' : null,
    triage,
    ...(options.verdictKey === undefined ? {} : { verdictKey: options.verdictKey }),
  }
}

function verdict(key: string, status: VerdictStatus, label?: VerdictLabel): Verdict {
  return {
    key,
    packageName: key.split('@')[0],
    status,
    label,
    summary: label ? `${label} summary` : undefined,
    changes: [],
    sourceUrl: 'https://example.test/CHANGELOG.md',
    inputTruncated: false,
    fromVersion: '1.0.0',
    toVersion: '2.0.0',
    decidedAt: '2026-11-23T00:00:00.000Z',
  }
}

function byKey(...verdicts: Verdict[]): Map<string, Verdict> {
  return new Map(verdicts.map((v) => [v.key, v]))
}

/** "section: name, name" lines for one group, to compare a whole layout at once. */
function layout(report: Report, group: DependencyGroup): string[] {
  const found = report.groups.find((g) => g.group === group)
  if (!found) throw new Error(`no group ${group}`)
  return found.sections.map((s) => `${s.id}: ${s.rows.map((r) => r.dependency.name).join(', ')}`)
}

describe('rowState', () => {
  it('comes from the verdict when there is one', () => {
    const d = dep('a', 'major', { verdictKey: 'a@1->2.0' })
    expect(rowState(d, verdict('a@1->2.0', 'ready', 'breaking'))).toBe('breaking')
    expect(rowState(d, verdict('a@1->2.0', 'ready', 'unclear'))).toBe('unclear')
    expect(rowState(d, verdict('a@1->2.0', 'ready', 'safe'))).toBe('safe')
    expect(rowState(d, verdict('a@1->2.0', 'no-changelog'))).toBe('no-changelog')
    expect(rowState(d, verdict('a@1->2.0', 'failed'))).toBe('failed')
  })

  it('comes from triage when there is no verdict', () => {
    expect(rowState(dep('a', 'major'), null)).toBe('pending')
    expect(rowState(dep('a', 'up-to-date'), null)).toBe('up-to-date')
    expect(rowState(dep('a', 'not-checked'), null)).toBe('not-checked')
  })

  it('calls an unread minor or patch upgrade "not read", never "safe"', () => {
    expect(rowState(dep('a', 'minor'), null)).toBe('not-read')
    expect(rowState(dep('a', 'patch'), null)).toBe('not-read')
  })

  it('treats a ready verdict with no label as unclear rather than guessing', () => {
    expect(rowState(dep('a', 'major'), verdict('a@1->2.0', 'ready'))).toBe('unclear')
  })
})

describe('sectionOf', () => {
  it('lists everything bumpcheck could not settle under "unclear"', () => {
    const d = dep('a', 'major')
    for (const state of ['unclear', 'failed', 'no-changelog', 'pending'] as const) {
      expect(sectionOf(state, d)).toBe('unclear')
    }
  })

  it('keeps "safe major" for majors: a checked minor that is safe stays with minor and patch', () => {
    expect(sectionOf('safe', dep('a', 'major'))).toBe('safe-major')
    expect(sectionOf('safe', dep('a', 'minor'))).toBe('minor-patch')
    expect(sectionOf('safe', dep('a', 'patch'))).toBe('minor-patch')
  })

  it('puts a breaking verdict under "breaking" whatever the size of the upgrade', () => {
    expect(sectionOf('breaking', dep('a', 'major'))).toBe('breaking')
    expect(sectionOf('breaking', dep('a', 'patch'))).toBe('breaking')
  })
})

describe('buildReport', () => {
  const dependencies = [
    dep('uptodate', 'up-to-date'),
    dep('patchy', 'patch'),
    dep('safe-major', 'major', { verdictKey: 'safe-major@1->2.0' }),
    dep('local', 'not-checked'),
    dep('minor-b', 'minor'),
    dep('unclear', 'major', { verdictKey: 'unclear@1->2.0' }),
    dep('breaking-b', 'major', { verdictKey: 'breaking-b@1->2.0' }),
    dep('minor-a', 'minor'),
    dep('breaking-a', 'major', { verdictKey: 'breaking-a@1->2.0' }),
    dep('dev-breaking', 'major', { group: 'dev', verdictKey: 'dev-breaking@1->2.0' }),
    dep('dev-minor', 'minor', { group: 'dev' }),
  ]
  const verdicts = byKey(
    verdict('safe-major@1->2.0', 'ready', 'safe'),
    verdict('unclear@1->2.0', 'ready', 'unclear'),
    verdict('breaking-a@1->2.0', 'ready', 'breaking'),
    verdict('breaking-b@1->2.0', 'ready', 'breaking'),
    verdict('dev-breaking@1->2.0', 'ready', 'breaking'),
  )

  it('keeps runtime and dev dependencies in separate groups, runtime first', () => {
    const report = buildReport(dependencies, verdicts, [])
    expect(report.groups.map((g) => g.group)).toEqual(['runtime', 'dev'])
    expect(report.groups.map((g) => g.count)).toEqual([9, 2])
  })

  it('orders the sections: breaking, unclear, safe major, minor or patch, up to date, not checked', () => {
    const report = buildReport(dependencies, verdicts, [])
    expect(layout(report, 'runtime')).toEqual([
      'breaking: breaking-a, breaking-b',
      'unclear: unclear',
      'safe-major: safe-major',
      'minor-patch: minor-a, minor-b, patchy',
      'up-to-date: uptodate',
      'not-checked: local',
    ])
    expect(layout(report, 'dev')).toEqual(['breaking: dev-breaking', 'minor-patch: dev-minor'])
    expect(SECTION_ORDER).toEqual(['breaking', 'unclear', 'safe-major', 'minor-patch', 'up-to-date', 'not-checked'])
  })

  it('leaves out a section that has no rows, and lists an empty group with no sections', () => {
    const report = buildReport([dep('only', 'up-to-date')], new Map(), [])
    expect(layout(report, 'runtime')).toEqual(['up-to-date: only'])
    expect(report.groups[1]).toEqual({ group: 'dev', count: 0, sections: [] })
  })

  it('inside "unclear": unclear, then failed, then no changelog, then not read yet', () => {
    const deps = [
      dep('pending', 'major'),
      dep('nochangelog', 'major', { verdictKey: 'nochangelog@1->2.0' }),
      dep('failed', 'major', { verdictKey: 'failed@1->2.0' }),
      dep('vague', 'major', { verdictKey: 'vague@1->2.0' }),
    ]
    const report = buildReport(
      deps,
      byKey(
        verdict('nochangelog@1->2.0', 'no-changelog'),
        verdict('failed@1->2.0', 'failed'),
        verdict('vague@1->2.0', 'ready', 'unclear'),
      ),
      [],
    )
    expect(layout(report, 'runtime')).toEqual(['unclear: vague, failed, nochangelog, pending'])
  })

  it('inside "minor or patch": the ones read on request first, then minor before patch, then by name', () => {
    const deps = [
      dep('z-patch', 'patch'),
      dep('b-minor', 'minor'),
      dep('checked-patch', 'patch', { verdictKey: 'checked-patch@1->2.0' }),
      dep('a-minor', 'minor'),
    ]
    const report = buildReport(deps, byKey(verdict('checked-patch@1->2.0', 'ready', 'safe')), [])
    expect(layout(report, 'runtime')).toEqual(['minor-patch: checked-patch, a-minor, b-minor, z-patch'])
  })

  it('moves a minor upgrade read on request to "breaking" when its verdict says so', () => {
    const deps = [dep('sneaky', 'minor', { verdictKey: 'sneaky@1->2.0' })]
    const report = buildReport(deps, byKey(verdict('sneaky@1->2.0', 'ready', 'breaking')), [])
    expect(layout(report, 'runtime')).toEqual(['breaking: sneaky'])
    expect(report.unreviewedBreaking).toBe(1)
  })

  it('treats a verdict that has not loaded as no verdict yet', () => {
    const report = buildReport([dep('a', 'major', { verdictKey: 'a@1->2.0' })], new Map(), [])
    expect(report.groups[0].sections[0].rows[0]).toMatchObject({ state: 'pending', verdict: null })
  })

  it('does not show a verdict that was read from a later version than this project is on', () => {
    // dep() is on 1.0.0. The stored verdict was read from 1.0.5, so it skipped 1.0.1 to 1.0.5.
    const narrow = { ...verdict('lib@1->1.1', 'ready', 'safe'), fromVersion: '1.0.5' }
    const deps = [dep('lib', 'minor', { verdictKey: 'lib@1->1.1' })]
    const row = buildReport(deps, byKey(narrow), []).groups[0].sections[0].rows[0]
    expect(row).toMatchObject({ state: 'not-read', verdict: null })

    // Read from this project's own version, it is shown.
    const wide = { ...narrow, fromVersion: '1.0.0' }
    expect(buildReport(deps, byKey(wide), []).groups[0].sections[0].rows[0]).toMatchObject({ state: 'safe' })
  })

  it('moves reviewed rows out of the groups into the reviewed list, runtime first', () => {
    const report = buildReport(dependencies, verdicts, ['dev-breaking@1->2.0', 'breaking-b@1->2.0', 'safe-major@1->2.0'])
    expect(report.reviewed.map((r) => r.dependency.name)).toEqual(['breaking-b', 'safe-major', 'dev-breaking'])
    expect(layout(report, 'runtime')[0]).toBe('breaking: breaking-a')
    expect(layout(report, 'dev')).toEqual(['minor-patch: dev-minor'])
    expect(report.groups.map((g) => g.count)).toEqual([7, 1])
  })

  it('brings a row back when its key is removed from the reviewed list (undo)', () => {
    const reviewed = addReviewedKey([], 'breaking-a@1->2.0')
    expect(buildReport(dependencies, verdicts, reviewed).reviewed).toHaveLength(1)
    const undone = removeReviewedKey(reviewed, 'breaking-a@1->2.0')
    const report = buildReport(dependencies, verdicts, undone)
    expect(report.reviewed).toEqual([])
    expect(layout(report, 'runtime')[0]).toBe('breaking: breaking-a, breaking-b')
  })

  it('shows a newer verdict for the same package as new, even though the older one was reviewed', () => {
    const oldKey = verdictKey('express', '4.17.1', '5.1.0')
    const newKey = verdictKey('express', '4.17.1', '5.2.0')
    expect(newKey).not.toBe(oldKey)

    const before = buildReport([dep('express', 'major', { verdictKey: oldKey })], byKey(verdict(oldKey, 'ready', 'breaking')), [oldKey])
    expect(before.reviewed).toHaveLength(1)
    expect(before.unreviewedBreaking).toBe(0)

    // The next scan finds 5.2.0 and attaches the verdict under its new key.
    const after = buildReport([dep('express', 'major', { verdictKey: newKey })], byKey(verdict(newKey, 'ready', 'breaking')), [oldKey])
    expect(after.reviewed).toEqual([])
    expect(layout(after, 'runtime')).toEqual(['breaking: express'])
    expect(after.unreviewedBreaking).toBe(1)
  })

  it('never hides a failed verdict, even if its key is in the reviewed list', () => {
    const deps = [dep('a', 'major', { verdictKey: 'a@1->2.0' })]
    const report = buildReport(deps, byKey(verdict('a@1->2.0', 'failed')), ['a@1->2.0'])
    expect(report.reviewed).toEqual([])
    expect(layout(report, 'runtime')).toEqual(['unclear: a'])
  })

  it('ignores reviewed keys that match no dependency', () => {
    const report = buildReport(dependencies, verdicts, ['gone@1->2.0'])
    expect(report.reviewed).toEqual([])
  })
})

describe('isReviewable', () => {
  it('is true for any verdict except a failed one, and false with no verdict', () => {
    const v = verdict('a@1->2.0', 'ready', 'breaking')
    expect(isReviewable({ verdict: v, state: 'breaking' })).toBe(true)
    expect(isReviewable({ verdict: v, state: 'safe' })).toBe(true)
    expect(isReviewable({ verdict: v, state: 'unclear' })).toBe(true)
    expect(isReviewable({ verdict: v, state: 'no-changelog' })).toBe(true)
    expect(isReviewable({ verdict: v, state: 'failed' })).toBe(false)
    expect(isReviewable({ verdict: null, state: 'not-read' })).toBe(false)
  })
})

describe('countUnreviewedBreaking', () => {
  const dependencies = [
    dep('a', 'major', { verdictKey: 'a@1->2.0' }),
    dep('b', 'major', { verdictKey: 'b@1->2.0' }),
    dep('c', 'major', { group: 'dev', verdictKey: 'c@1->2.0' }),
    dep('safe', 'major', { verdictKey: 'safe@1->2.0' }),
    dep('unread', 'minor'),
  ]
  const verdicts = byKey(
    verdict('a@1->2.0', 'ready', 'breaking'),
    verdict('b@1->2.0', 'ready', 'breaking'),
    verdict('c@1->2.0', 'ready', 'breaking'),
    verdict('safe@1->2.0', 'ready', 'safe'),
  )

  it('counts breaking verdicts across runtime and dev', () => {
    expect(countUnreviewedBreaking(dependencies, verdicts, [])).toBe(3)
  })

  it('does not count the reviewed ones', () => {
    expect(countUnreviewedBreaking(dependencies, verdicts, ['a@1->2.0'])).toBe(2)
    expect(countUnreviewedBreaking(dependencies, verdicts, ['a@1->2.0', 'b@1->2.0', 'c@1->2.0'])).toBe(0)
  })

  it('is not lowered by reviewing a verdict that is not breaking', () => {
    expect(countUnreviewedBreaking(dependencies, verdicts, ['safe@1->2.0'])).toBe(3)
  })

  it('is zero for a project with no dependencies or no verdicts loaded', () => {
    expect(countUnreviewedBreaking([], verdicts, [])).toBe(0)
    expect(countUnreviewedBreaking(dependencies, new Map(), [])).toBe(0)
  })
})

describe('addReviewedKey and removeReviewedKey', () => {
  it('add once, remove, and never change the list they were given', () => {
    const start = ['a']
    expect(addReviewedKey(start, 'b')).toEqual(['a', 'b'])
    expect(addReviewedKey(start, 'a')).toEqual(['a'])
    expect(removeReviewedKey(['a', 'b'], 'a')).toEqual(['b'])
    expect(removeReviewedKey(start, 'missing')).toEqual(['a'])
    expect(start).toEqual(['a'])
  })
})
