import { describe, expect, it } from 'vitest'
import { PUBLIC_REPORT_COLUMNS, publicReportOf, readVisibility, shareLinkPath } from './public-report'

/** A whole project row, as the server reads it: everything the owner's page uses. */
const project = {
  id: 'project-1',
  userId: 'user-alice-123',
  visibility: 'public',
  repoOwner: 'acme',
  repoName: 'shop',
  defaultBranch: 'main',
  dependencies: [
    { name: 'express', group: 'runtime' as const, declared: '^4.0.0', current: '4.0.0', target: '5.1.0', triage: 'major' as const, verdictKey: 'express@4->5.1' },
  ],
  scanStatus: 'done' as const,
  scanProgress: null,
  scanReport: { judged: 1, deferredByScanCap: 0, deferredByDailyCeiling: 0 },
  scanError: null,
  lastScanAt: '2026-11-24T10:00:00.000Z',
  nextDueAt: '2026-11-25T10:00:00.000Z',
  lastScanRequestedAt: '2026-11-24T09:59:00.000Z',
  lastOpenedAt: '2026-11-24T09:58:00.000Z',
  scanHeartbeatAt: '2026-11-24T10:00:00.000Z',
  checkRequests: [],
  reviewedKeys: ['express@4->5.1'],
  alertsEnabled: 1,
  alertedKeys: ['express@4->5.1'],
}

describe('publicReportOf: what a public report holds', () => {
  it('copies the repo, the dependencies, the scan status and the scan time', () => {
    expect(publicReportOf(project)).toEqual({
      projectId: 'project-1',
      repoOwner: 'acme',
      repoName: 'shop',
      dependencies: project.dependencies,
      scanStatus: 'done',
      lastScanAt: '2026-11-24T10:00:00.000Z',
    })
  })

  it('holds nothing else: no owner id, no review state, no alert state', () => {
    const report = publicReportOf(project)
    expect(Object.keys(report).sort()).toEqual([...PUBLIC_REPORT_COLUMNS].sort())
    for (const kept of ['userId', 'visibility', 'reviewedKeys', 'alertsEnabled', 'alertedKeys', 'lastOpenedAt', 'checkRequests']) {
      expect(report).not.toHaveProperty(kept)
    }
    expect(JSON.stringify(report)).not.toContain('user-alice-123')
  })

  it('has no column that could carry the owner', () => {
    expect(PUBLIC_REPORT_COLUMNS).toEqual(['projectId', 'repoOwner', 'repoName', 'dependencies', 'scanStatus', 'lastScanAt'])
  })
})

describe('readVisibility', () => {
  it('accepts exactly "private" and "public"', () => {
    expect(readVisibility('private')).toBe('private')
    expect(readVisibility('public')).toBe('public')
  })

  it('refuses anything else', () => {
    for (const value of ['Public', 'shared', '', null, undefined, true, 1, {}]) expect(readVisibility(value)).toBeNull()
  })
})

describe('shareLinkPath', () => {
  it('is the public view of one project', () => {
    expect(shareLinkPath('project-1')).toBe('/share/project-1')
  })

  it('keeps an odd id inside one path segment', () => {
    expect(shareLinkPath('a/b?c')).toBe('/share/a%2Fb%3Fc')
  })
})
