/**
 * `syncPublicReport` against an in-memory stand-in for the record tools.
 * The stand-in keeps rows by collection and id, like the record room does.
 */

import { describe, expect, it } from 'vitest'
import { PUBLIC_REPORTS, syncPublicReport, type ReportTools } from './public-report'

type Rows = Map<string, Record<string, unknown>>

function world(projects: Record<string, Record<string, unknown>>) {
  const collections: Record<string, Rows> = {
    projects: new Map(Object.entries(projects)),
    [PUBLIC_REPORTS]: new Map(),
  }
  /** Runs just before a write to the public reports, so a test can change the project "in between". */
  let beforeReportWrite: () => void = () => {}
  const failing = new Set<string>()
  const fail = (what: string) => ({ success: false as const, error: `${what} failed` })

  const tools: ReportTools = {
    async get(collection, recordId) {
      const data = collections[collection].get(recordId)
      if (!data) return { success: false, error: `Record not found: ${collection}/${recordId}` }
      return { success: true, data: { record: { recordId, data, createdBy: 'app-owner', createdAt: '', updatedAt: '' } } } as never
    },
    async create(collection, data, recordId) {
      if (failing.has('create')) return fail('create') as never
      beforeReportWrite()
      collections[collection].set(String(recordId), { ...data })
      return { success: true, data: { recordId } } as never
    },
    async update(collection, recordId, data) {
      if (failing.has('update')) return fail('update') as never
      beforeReportWrite()
      const existing = collections[collection].get(recordId)
      // The record room's own words for this: an update never creates.
      if (!existing) return { success: false, error: `records.update: no record "${recordId}" in ${collection}` } as never
      collections[collection].set(recordId, { ...existing, ...data })
      return { success: true, data: { recordId } } as never
    },
    async remove(collection, recordId) {
      if (failing.has('remove')) return fail('remove') as never
      if (!collections[collection].delete(recordId)) return { success: false, error: 'Record not found' } as never
      return { success: true, data: { recordId } } as never
    },
  }
  return {
    tools,
    reports: collections[PUBLIC_REPORTS],
    projects: collections.projects,
    failing,
    onReportWrite: (run: () => void) => {
      beforeReportWrite = run
    },
  }
}

const shop = (visibility: string) => ({
  userId: 'user-alice-123',
  visibility,
  repoOwner: 'acme',
  repoName: 'shop',
  dependencies: [{ name: 'express', group: 'runtime', declared: '^4.0.0', current: '4.0.0', target: '5.1.0', triage: 'major' }],
  scanStatus: 'done',
  lastScanAt: '2026-11-24T10:00:00.000Z',
  reviewedKeys: ['express@4->5.1'],
  alertsEnabled: 1,
})

describe('syncPublicReport', () => {
  it('writes the public report of a public project, under the project id, with no owner in it', async () => {
    const w = world({ p1: shop('public') })
    expect(await syncPublicReport(w.tools, 'p1')).toEqual({ ok: true, published: true })
    expect(w.reports.get('p1')).toEqual({
      projectId: 'p1',
      repoOwner: 'acme',
      repoName: 'shop',
      dependencies: shop('public').dependencies,
      scanStatus: 'done',
      lastScanAt: '2026-11-24T10:00:00.000Z',
    })
    expect(JSON.stringify([...w.reports])).not.toContain('user-alice-123')
  })

  it('writes nothing for a private project', async () => {
    const w = world({ p1: shop('private') })
    expect(await syncPublicReport(w.tools, 'p1')).toEqual({ ok: true, published: false })
    expect(w.reports.size).toBe(0)
  })

  it('removes the public report when the project has gone back to private', async () => {
    const w = world({ p1: shop('public') })
    await syncPublicReport(w.tools, 'p1')
    w.projects.set('p1', shop('private'))
    expect(await syncPublicReport(w.tools, 'p1')).toEqual({ ok: true, published: false })
    expect(w.reports.size).toBe(0)
  })

  it('removes the public report of a project that no longer exists', async () => {
    const w = world({ p1: shop('public') })
    await syncPublicReport(w.tools, 'p1')
    w.projects.delete('p1')
    expect(await syncPublicReport(w.tools, 'p1')).toEqual({ ok: true, published: false })
    expect(w.reports.size).toBe(0)
  })

  it('refreshes an existing public report with what the project holds now', async () => {
    const w = world({ p1: shop('public') })
    await syncPublicReport(w.tools, 'p1')
    w.projects.set('p1', { ...shop('public'), scanStatus: 'failed', lastScanAt: '2026-11-25T10:00:00.000Z', dependencies: [] })
    await syncPublicReport(w.tools, 'p1')
    expect(w.reports.get('p1')).toMatchObject({ scanStatus: 'failed', lastScanAt: '2026-11-25T10:00:00.000Z', dependencies: [] })
  })

  it('takes the report back if the owner switched to private while it was being written', async () => {
    for (const start of ['fresh', 'already published'] as const) {
      const w = world({ p1: shop('public') })
      if (start === 'already published') await syncPublicReport(w.tools, 'p1')
      // The switch to private lands between this sync's read and its write, and its own removal finds nothing yet.
      w.onReportWrite(() => w.projects.set('p1', shop('private')))
      expect(await syncPublicReport(w.tools, 'p1'), start).toEqual({ ok: true, published: false })
      expect(w.reports.size, start).toBe(0)
    }
  })

  it('says so when the report could not be written or removed', async () => {
    const w = world({ p1: shop('public') })
    w.failing.add('create')
    expect(await syncPublicReport(w.tools, 'p1')).toMatchObject({ ok: false })

    w.failing.clear()
    await syncPublicReport(w.tools, 'p1')
    w.projects.set('p1', shop('private'))
    w.failing.add('remove')
    expect(await syncPublicReport(w.tools, 'p1')).toMatchObject({ ok: false })
    expect(w.reports.size).toBe(1)
  })
})
