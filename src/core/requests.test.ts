import { describe, expect, it } from 'vitest'
import type { DependencyResult, ScanStatus, TriageClass, VerdictStatus } from './model'
import { LIMITS } from '../config'
import { checkOnDemandRequest, checkReviewRequest, checkScanNowRequest } from './requests'

function dep(name: string, triage: TriageClass, verdictKey?: string): DependencyResult {
  const checked = triage !== 'not-checked'
  return {
    name,
    group: 'runtime',
    declared: '^1.0.0',
    current: checked ? '1.0.0' : null,
    target: checked ? '1.1.0' : null,
    triage,
    ...(verdictKey === undefined ? {} : { verdictKey }),
  }
}

/** A stored verdict that was read from 1.0.0, the version `dep()` is on. Null for "no verdict". */
function stored(status: VerdictStatus | null, fromVersion = '1.0.0') {
  return status === null ? null : { status, fromVersion }
}

describe('checkOnDemandRequest: "check this one"', () => {
  const base = { kind: 'check', scanStatus: 'done', verdict: null } as const

  it('accepts an unread minor or patch upgrade of a scanned project', () => {
    expect(checkOnDemandRequest({ ...base, dependency: dep('a', 'minor') })).toEqual({ ok: true })
    expect(checkOnDemandRequest({ ...base, dependency: dep('a', 'patch') })).toEqual({ ok: true })
  })

  it('refuses a package that is not one of the project\'s dependencies', () => {
    expect(checkOnDemandRequest({ ...base, dependency: undefined })).toMatchObject({
      ok: false,
      refusal: 'not-a-dependency',
    })
  })

  it.each(['major', 'up-to-date', 'not-checked'] as const)('refuses a %s dependency: only minor and patch are read on request', (triage) => {
    expect(checkOnDemandRequest({ ...base, dependency: dep('a', triage) })).toMatchObject({
      ok: false,
      refusal: 'not-minor-or-patch',
    })
  })

  it.each(['ready', 'no-changelog', 'failed'] as const)('refuses an upgrade that already has a %s verdict, so it is never paid for twice', (verdictStatus) => {
    expect(checkOnDemandRequest({ ...base, verdict: stored(verdictStatus), dependency: dep('a', 'minor', 'a@1->1.1') })).toMatchObject({
      ok: false,
      refusal: 'already-read',
    })
  })

  it.each(['queued', 'scanning'] as const)('refuses while a scan is %s: one scan at a time per project', (scanStatus) => {
    expect(checkOnDemandRequest({ ...base, scanStatus, dependency: dep('a', 'minor') })).toMatchObject({
      ok: false,
      refusal: 'scan-running',
    })
  })

  it.each(['idle', 'failed'] as const)('refuses when the last scan is %s: there are no finished results to add to', (scanStatus: ScanStatus) => {
    expect(checkOnDemandRequest({ ...base, scanStatus, dependency: dep('a', 'minor') })).toMatchObject({
      ok: false,
      refusal: 'scan-not-finished',
    })
  })

  it('accepts an upgrade whose stored verdict was read from a later version: that verdict does not cover it', () => {
    const dependency = dep('a', 'minor', 'a@1->1.1')
    expect(checkOnDemandRequest({ ...base, verdict: stored('ready', '1.0.1'), dependency })).toEqual({ ok: true })
    // Read from this version or an earlier one, it does cover it.
    expect(checkOnDemandRequest({ ...base, verdict: stored('ready', '1.0.0'), dependency })).toMatchObject({ refusal: 'already-read' })
    expect(checkOnDemandRequest({ ...base, verdict: stored('ready', '0.9.0'), dependency })).toMatchObject({ refusal: 'already-read' })
  })

  it('gives every refusal a message to show the user', () => {
    const refused = checkOnDemandRequest({ ...base, dependency: undefined })
    expect(refused.ok === false && refused.message.length > 0).toBe(true)
  })
})

describe('checkOnDemandRequest: retry a failed verdict', () => {
  const base = { kind: 'retry', scanStatus: 'done' } as const

  it('accepts a dependency whose verdict failed, whatever the size of the upgrade', () => {
    expect(checkOnDemandRequest({ ...base, verdict: stored('failed'), dependency: dep('a', 'major', 'a@1->2.0') })).toEqual({ ok: true })
    expect(checkOnDemandRequest({ ...base, verdict: stored('failed'), dependency: dep('a', 'minor', 'a@1->1.1') })).toEqual({ ok: true })
  })

  it.each(['ready', 'no-changelog', null] as const)('refuses when the verdict is %s: only a failed verdict is judged again', (verdictStatus) => {
    expect(checkOnDemandRequest({ ...base, verdict: stored(verdictStatus), dependency: dep('a', 'major', 'a@1->2.0') })).toMatchObject({
      ok: false,
      refusal: 'not-failed',
    })
  })

  it('refuses while a scan is running, and for a package the project does not have', () => {
    expect(
      checkOnDemandRequest({ ...base, scanStatus: 'scanning', verdict: stored('failed'), dependency: dep('a', 'major', 'a@1->2.0') }),
    ).toMatchObject({ ok: false, refusal: 'scan-running' })
    expect(checkOnDemandRequest({ ...base, verdict: stored('failed'), dependency: undefined })).toMatchObject({
      ok: false,
      refusal: 'not-a-dependency',
    })
  })
})

describe('checkReviewRequest', () => {
  const dependencies = [dep('a', 'major', 'a@1->2.0'), dep('b', 'minor')]

  it('accepts the key of a verdict attached to one of the project\'s dependencies', () => {
    expect(checkReviewRequest({ dependencies, verdictKey: 'a@1->2.0', verdictStatus: 'ready' })).toEqual({ ok: true })
    expect(checkReviewRequest({ dependencies, verdictKey: 'a@1->2.0', verdictStatus: 'no-changelog' })).toEqual({ ok: true })
  })

  it('refuses a key that no dependency of the project points at', () => {
    expect(checkReviewRequest({ dependencies, verdictKey: 'other@1->2.0', verdictStatus: 'ready' })).toMatchObject({ ok: false })
  })

  it('refuses anything that is not a non-empty string', () => {
    for (const verdictKey of [undefined, null, 7, '', ['a@1->2.0']]) {
      expect(checkReviewRequest({ dependencies, verdictKey, verdictStatus: 'ready' })).toMatchObject({ ok: false })
    }
  })

  it('refuses a failed verdict (it is retried, not reviewed) and a verdict that does not exist', () => {
    expect(checkReviewRequest({ dependencies, verdictKey: 'a@1->2.0', verdictStatus: 'failed' })).toMatchObject({ ok: false })
    expect(checkReviewRequest({ dependencies, verdictKey: 'a@1->2.0', verdictStatus: null })).toMatchObject({ ok: false })
  })
})

describe('checkScanNowRequest: "scan now"', () => {
  const now = Date.parse('2026-11-23T12:00:00.000Z')
  const longAgo = now - LIMITS.scanNowCooldownMs

  it.each(['idle', 'done', 'failed'] as const)('accepts a project whose status is %s once the cooldown has passed', (scanStatus) => {
    expect(checkScanNowRequest({ scanStatus, lastScanRequestedAt: longAgo, now })).toEqual({ ok: true })
  })

  it('accepts a project that never had a scan requested', () => {
    expect(checkScanNowRequest({ scanStatus: 'done', lastScanRequestedAt: null, now })).toEqual({ ok: true })
  })

  it.each(['queued', 'scanning'] as const)('refuses while a scan is %s: one scan at a time', (scanStatus) => {
    expect(checkScanNowRequest({ scanStatus, lastScanRequestedAt: longAgo, now })).toMatchObject({
      ok: false,
      refusal: 'scan-running',
    })
  })

  it('refuses inside the 10-minute cooldown and says when it will be available', () => {
    const lastScanRequestedAt = now - LIMITS.scanNowCooldownMs + 1
    const check = checkScanNowRequest({ scanStatus: 'done', lastScanRequestedAt, now })
    expect(check).toMatchObject({ ok: false, refusal: 'cooling-down', availableAt: lastScanRequestedAt + LIMITS.scanNowCooldownMs })
    // 12:00:00.001 UTC is when it comes back.
    expect(check.ok ? '' : check.message).toContain('12:00 UTC')
  })

  it('applies the cooldown to a failed scan too: a retry is a scan request', () => {
    expect(checkScanNowRequest({ scanStatus: 'failed', lastScanRequestedAt: now - 1000, now })).toMatchObject({
      ok: false,
      refusal: 'cooling-down',
    })
  })
})
