/**
 * Which verdicts an alert email may tell a project's owner about.
 */

import { describe, expect, it } from 'vitest'
import { LIMITS } from '../config'
import { alertsSentOn, alreadyAlertedKeys, failedSendsOf, pickAlertItems, pickTestItems } from './alert-rules'
import type { AlertLogEntry, DependencyResult, Verdict } from './model'

function dep(name: string, overrides: Partial<DependencyResult> = {}): DependencyResult {
  return {
    name,
    group: 'runtime',
    declared: '^1.0.0',
    current: '1.0.0',
    target: '2.0.0',
    triage: 'major',
    verdictKey: `${name}@1->2.0`,
    ...overrides,
  }
}

function verdict(name: string, overrides: Partial<Verdict> = {}): Verdict {
  return {
    key: `${name}@1->2.0`,
    packageName: name,
    status: 'ready',
    label: 'breaking',
    summary: `${name} 2.0.0 breaks things.`,
    changes: [
      { title: 'First', whatChanged: 'A changed.', apiNames: ['a'], whatToDo: `Fix ${name} first.` },
      { title: 'Second', whatChanged: 'B changed.', apiNames: ['b'], whatToDo: 'Then this.' },
    ],
    sourceUrl: `https://github.com/acme/${name}/blob/HEAD/CHANGELOG.md`,
    inputTruncated: false,
    fromVersion: '1.0.0',
    toVersion: '2.0.0',
    decidedAt: '2026-11-23T12:00:00.000Z',
    ...overrides,
  }
}

function byKey(...verdicts: Verdict[]): Map<string, Verdict> {
  return new Map(verdicts.map((v) => [v.key, v]))
}

function entry(overrides: Partial<AlertLogEntry> = {}): AlertLogEntry {
  return {
    projectId: 'project-1',
    userId: 'user-1',
    sentAt: '2026-11-23T12:00:00.000Z',
    kind: 'alert',
    outcome: 'sent',
    verdictKeys: [],
    failureReason: null,
    ...overrides,
  }
}

const nothingYet = { reviewedKeys: [], alertedKeys: [], log: [] }

describe('pickAlertItems', () => {
  it('picks a breaking verdict nobody has been told about, with what the email shows', () => {
    const items = pickAlertItems({ dependencies: [dep('zod')], verdicts: byKey(verdict('zod')), ...nothingYet })
    expect(items).toEqual([
      {
        verdictKey: 'zod@1->2.0',
        packageName: 'zod',
        group: 'runtime',
        fromVersion: '1.0.0',
        toVersion: '2.0.0',
        summary: 'zod 2.0.0 breaks things.',
        changeCount: 2,
        firstWhatToDo: 'Fix zod first.',
        sourceUrl: 'https://github.com/acme/zod/blob/HEAD/CHANGELOG.md',
      },
    ])
  })

  it('shows the version the project is on, not the one the shared verdict happened to be read from', () => {
    const items = pickAlertItems({
      dependencies: [dep('zod', { current: '1.4.2', target: '2.1.0' })],
      verdicts: byKey(verdict('zod', { fromVersion: '1.0.0', toVersion: '2.1.3' })),
      ...nothingYet,
    })
    expect(items[0]).toMatchObject({ fromVersion: '1.4.2', toVersion: '2.1.0' })
  })

  it('picks only breaking verdicts: not safe, unclear, failed or "no changelog"', () => {
    const dependencies = ['breaks', 'safe', 'unclear', 'failed', 'silent', 'unread'].map((name) => dep(name))
    const verdicts = byKey(
      verdict('breaks'),
      verdict('safe', { label: 'safe', changes: [] }),
      verdict('unclear', { label: 'unclear', changes: [] }),
      verdict('failed', { status: 'failed', label: undefined, changes: [] }),
      verdict('silent', { status: 'no-changelog', label: undefined, changes: [] }),
      // "unread" has a pointer but its verdict is not in the cache.
    )
    expect(pickAlertItems({ dependencies, verdicts, ...nothingYet }).map((i) => i.packageName)).toEqual(['breaks'])
  })

  it('leaves out a verdict the user marked as reviewed', () => {
    const input = { dependencies: [dep('zod'), dep('chalk')], verdicts: byKey(verdict('zod'), verdict('chalk')), alertedKeys: [], log: [] }
    expect(pickAlertItems({ ...input, reviewedKeys: ['zod@1->2.0'] }).map((i) => i.packageName)).toEqual(['chalk'])
  })

  it('leaves out a verdict the project row says was already alerted', () => {
    const input = { dependencies: [dep('zod'), dep('chalk')], verdicts: byKey(verdict('zod'), verdict('chalk')), reviewedKeys: [], log: [] }
    expect(pickAlertItems({ ...input, alertedKeys: ['zod@1->2.0'] }).map((i) => i.packageName)).toEqual(['chalk'])
  })

  it('leaves out a verdict the send log shows in a sent alert, even if the project row does not say so', () => {
    const input = { dependencies: [dep('zod'), dep('chalk')], verdicts: byKey(verdict('zod'), verdict('chalk')), reviewedKeys: [], alertedKeys: [] }
    const log = [entry({ verdictKeys: ['zod@1->2.0'] })]
    expect(pickAlertItems({ ...input, log }).map((i) => i.packageName)).toEqual(['chalk'])
  })

  it('a test email, or an alert that failed, does not count as "already alerted"', () => {
    const input = { dependencies: [dep('zod')], verdicts: byKey(verdict('zod')), reviewedKeys: [], alertedKeys: [] }
    const log = [entry({ kind: 'test', verdictKeys: ['zod@1->2.0'] }), entry({ outcome: 'failed', verdictKeys: ['zod@1->2.0'], failureReason: 'x' })]
    expect(pickAlertItems({ ...input, log }).map((i) => i.packageName)).toEqual(['zod'])
  })

  it('a verdict whose alert failed once is picked again; after the second failure it is left out', () => {
    const input = { dependencies: [dep('zod'), dep('chalk')], verdicts: byKey(verdict('zod'), verdict('chalk')), reviewedKeys: [], alertedKeys: [] }
    const failed = entry({ outcome: 'failed', verdictKeys: ['zod@1->2.0'], failureReason: 'x' })
    expect(pickAlertItems({ ...input, log: [failed] }).map((i) => i.packageName)).toEqual(['chalk', 'zod'])
    expect(pickAlertItems({ ...input, log: [failed, failed] }).map((i) => i.packageName)).toEqual(['chalk'])
    expect(LIMITS.alertSendAttemptsPerVerdict).toBe(2)
  })

  it('a newer verdict for the same package has a new key, so it is news again (story 34)', () => {
    const items = pickAlertItems({
      dependencies: [dep('zod', { target: '3.0.0', verdictKey: 'zod@1->3.0' })],
      verdicts: byKey(verdict('zod', { key: 'zod@1->3.0', toVersion: '3.0.0' })),
      reviewedKeys: ['zod@1->2.0'],
      alertedKeys: ['zod@1->2.0'],
      log: [],
    })
    expect(items.map((i) => i.verdictKey)).toEqual(['zod@1->3.0'])
  })

  it('lists runtime dependencies before dev dependencies, by name inside each', () => {
    const dependencies = [dep('b-dev', { group: 'dev' }), dep('zeta'), dep('alpha')]
    const verdicts = byKey(verdict('b-dev'), verdict('zeta'), verdict('alpha'))
    expect(pickAlertItems({ dependencies, verdicts, ...nothingYet }).map((i) => i.packageName)).toEqual(['alpha', 'zeta', 'b-dev'])
  })

  it('does not alert a minor verdict that was read from a later version than the project is on', () => {
    // Same rule as the page (src/core/verdict-cover.ts): that verdict is not this project's.
    const minor = dep('zod', { current: '4.2.0', target: '4.17.3', triage: 'minor', verdictKey: 'zod@4->4.17' })
    const verdicts = byKey(verdict('zod', { key: 'zod@4->4.17', fromVersion: '4.17.2', toVersion: '4.17.3' }))
    expect(pickAlertItems({ dependencies: [minor], verdicts, ...nothingYet })).toEqual([])
  })

  it('picks nothing when there is nothing', () => {
    expect(pickAlertItems({ dependencies: [], verdicts: byKey(), ...nothingYet })).toEqual([])
  })
})

describe('pickTestItems: what a test email shows', () => {
  it('shows the unreviewed breaking verdicts whether or not they were alerted before', () => {
    const dependencies = [dep('zod'), dep('chalk'), dep('seen')]
    const verdicts = byKey(verdict('zod'), verdict('chalk'), verdict('seen'))
    const items = pickTestItems({ dependencies, verdicts, reviewedKeys: ['seen@1->2.0'] })
    expect(items.map((i) => i.packageName)).toEqual(['chalk', 'zod'])
  })
})

describe('reading the send log', () => {
  const log = [
    entry({ sentAt: '2026-11-23T01:00:00.000Z', verdictKeys: ['a'] }),
    entry({ sentAt: '2026-11-23T23:59:59.999Z', verdictKeys: ['b'] }),
    entry({ sentAt: '2026-11-24T00:00:00.000Z', verdictKeys: ['c'] }),
    entry({ sentAt: '2026-11-23T05:00:00.000Z', kind: 'test', verdictKeys: ['d'] }),
    entry({ sentAt: '2026-11-23T06:00:00.000Z', outcome: 'failed', verdictKeys: ['e'], failureReason: 'x' }),
    entry({ sentAt: '2026-11-23T07:00:00.000Z', outcome: 'failed', verdictKeys: ['e', 'f'], failureReason: 'x' }),
  ]

  it('alertsSentOn counts the alerts sent on one UTC day: not tests, not failures, not other days', () => {
    expect(alertsSentOn(log, '2026-11-23')).toBe(2)
    expect(alertsSentOn(log, '2026-11-24')).toBe(1)
    expect(alertsSentOn(log, '2026-11-25')).toBe(0)
  })

  it('alreadyAlertedKeys joins the project row and the sent alerts in the log', () => {
    expect([...alreadyAlertedKeys(['row'], log)].sort()).toEqual(['a', 'b', 'c', 'row'])
  })

  it('failedSendsOf counts the failed alerts that included a verdict', () => {
    expect(failedSendsOf(log, 'e')).toBe(2)
    expect(failedSendsOf(log, 'f')).toBe(1)
    expect(failedSendsOf(log, 'a')).toBe(0)
  })
})
