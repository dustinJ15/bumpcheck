/**
 * Deleting a project, against an in-memory stand-in for the record tools.
 * The stand-in keeps rows by collection and id, like the record room does.
 */

import { describe, expect, it } from 'vitest'
import { deleteProjectRecords, type DeleteTools } from './delete-project'
import { PUBLIC_REPORTS } from './public-report'

type Row = Record<string, unknown>

function world(seed: Record<string, Record<string, Row>>) {
  const collections = new Map<string, Map<string, Row>>()
  const rowsOf = (collection: string) => {
    if (!collections.has(collection)) collections.set(collection, new Map())
    return collections.get(collection) as Map<string, Row>
  }
  for (const [collection, rows] of Object.entries(seed)) for (const [id, row] of Object.entries(rows)) rowsOf(collection).set(id, row)

  /** "collection.method" names that should fail. */
  const failing = new Set<string>()
  const failed = (what: string) => ({ success: false as const, error: `${what} failed` }) as never
  /** What the public saw at each moment the project row was removed. */
  const reportWhenProjectRemoved: boolean[] = []

  const tools: DeleteTools = {
    async get(collection, recordId) {
      if (failing.has(`${collection}.get`)) return failed('get')
      const data = rowsOf(collection).get(recordId)
      if (!data) return { success: false, error: `Record not found: ${collection}/${recordId}` }
      return { success: true, data: { record: { recordId, data, createdBy: 'app-owner', createdAt: '', updatedAt: '' } } } as never
    },
    async create(collection, data, recordId) {
      if (failing.has(`${collection}.create`)) return failed('create')
      rowsOf(collection).set(String(recordId), { ...data })
      return { success: true, data: { recordId } } as never
    },
    async update(collection, recordId, data) {
      if (failing.has(`${collection}.update`)) return failed('update')
      const existing = rowsOf(collection).get(recordId)
      if (!existing) return { success: false, error: `records.update: no record "${recordId}" in ${collection}` } as never
      rowsOf(collection).set(recordId, { ...existing, ...data })
      return { success: true, data: { recordId } } as never
    },
    async remove(collection, recordId) {
      if (failing.has(`${collection}.remove`)) return failed('remove')
      if (collection === 'projects') reportWhenProjectRemoved.push(rowsOf(PUBLIC_REPORTS).has(recordId))
      if (!rowsOf(collection).delete(recordId)) return { success: false, error: 'Record not found' } as never
      return { success: true, data: { recordId } } as never
    },
    async deleteWhere(collection, where, limit = 2) {
      if (failing.has(`${collection}.deleteWhere`)) return failed('deleteWhere')
      // A small batch size, so the drain loop has to go round more than once.
      let deleted = 0
      for (const [id, row] of rowsOf(collection)) {
        if (deleted >= limit) break
        if (Object.entries(where).every(([key, value]) => row[key] === value)) {
          rowsOf(collection).delete(id)
          deleted++
        }
      }
      return { success: true, data: { deleted } } as never
    },
  }
  return { tools, rowsOf, failing, reportWhenProjectRemoved }
}

const project = (userId: string, visibility: string): Row => ({
  userId,
  visibility,
  repoOwner: 'acme',
  repoName: 'shop',
  dependencies: [],
  scanStatus: 'done',
  lastScanAt: '2026-11-24T10:00:00.000Z',
  alertsEnabled: 1,
})

const logLine = (userId: string, projectId: string): Row => ({ userId, projectId, kind: 'alert', outcome: 'sent', sentAt: '2026-11-24T10:00:00.000Z' })

function seeded() {
  return world({
    projects: { p1: project('alice', 'public'), p2: project('alice', 'public'), b1: project('bob', 'public') },
    [PUBLIC_REPORTS]: { p1: { projectId: 'p1' }, p2: { projectId: 'p2' }, b1: { projectId: 'b1' } },
    alerts: {
      a1: logLine('alice', 'p1'),
      a2: logLine('alice', 'p1'),
      a3: logLine('alice', 'p1'),
      a4: logLine('alice', 'p2'),
      a5: logLine('bob', 'b1'),
    },
    verdicts: { v1: { key: 'express@4->5.1', packageName: 'express' } },
    attempts: { t1: { userId: 'alice', day: '2026-11-24', kind: 'test-email' }, t2: { userId: 'alice', day: '2026-11-24', kind: 'add-project' } },
  })
}

const remove = (w: ReturnType<typeof world>, projectId = 'p1', userId = 'alice') =>
  deleteProjectRecords({ caller: w.tools, owner: w.tools }, { projectId, userId })

describe('deleteProjectRecords', () => {
  it('removes the project row', async () => {
    const w = seeded()
    expect(await remove(w)).toEqual({ ok: true })
    expect(w.rowsOf('projects').has('p1')).toBe(false)
  })

  it('removes the public report of a public project, so its share link shows nothing', async () => {
    const w = seeded()
    await remove(w)
    expect(w.rowsOf(PUBLIC_REPORTS).has('p1')).toBe(false)
  })

  it('takes the public report away before the project row goes, never after', async () => {
    const w = seeded()
    await remove(w)
    expect(w.reportWhenProjectRemoved).toEqual([false])
  })

  it('removes the whole send log of that project, however many batches it takes', async () => {
    const w = seeded()
    await remove(w)
    expect([...w.rowsOf('alerts').keys()].sort()).toEqual(['a4', 'a5'])
  })

  it('leaves everything else: other projects and their reports and logs, shared verdicts, and the day\'s counted attempts', async () => {
    const w = seeded()
    await remove(w)
    expect([...w.rowsOf('projects').keys()].sort()).toEqual(['b1', 'p2'])
    expect([...w.rowsOf(PUBLIC_REPORTS).keys()].sort()).toEqual(['b1', 'p2'])
    expect(w.rowsOf('verdicts').size).toBe(1)
    expect(w.rowsOf('attempts').size).toBe(2)
  })

  it('deletes only log lines that belong to the caller, even if another user\'s line names the same project', async () => {
    const w = seeded()
    w.rowsOf('alerts').set('odd', logLine('bob', 'p1'))
    await remove(w)
    expect(w.rowsOf('alerts').has('odd')).toBe(true)
  })

  it('a private project is deleted the same way', async () => {
    const w = world({ projects: { p1: project('alice', 'private') }, alerts: { a1: logLine('alice', 'p1') } })
    expect(await remove(w)).toEqual({ ok: true })
    expect(w.rowsOf('projects').size).toBe(0)
    expect(w.rowsOf('alerts').size).toBe(0)
  })

  it('stops, and keeps the project, when the public report cannot be removed', async () => {
    const w = seeded()
    w.failing.add(`${PUBLIC_REPORTS}.remove`)
    expect(await remove(w)).toEqual({ ok: false })
    expect(w.rowsOf('projects').has('p1')).toBe(true)
    expect(w.rowsOf('alerts').has('a1')).toBe(true)
  })

  it('stops, and keeps the project, when the send log cannot be deleted', async () => {
    const w = seeded()
    w.failing.add('alerts.deleteWhere')
    expect(await remove(w)).toEqual({ ok: false })
    expect(w.rowsOf('projects').has('p1')).toBe(true)
    // Already out of public view by then, which is the safe way round.
    expect(w.rowsOf(PUBLIC_REPORTS).has('p1')).toBe(false)
  })

  it('says so when the project row itself cannot be removed, and can be run again', async () => {
    const w = seeded()
    w.failing.add('projects.remove')
    expect(await remove(w)).toEqual({ ok: false })
    w.failing.clear()
    expect(await remove(w)).toEqual({ ok: true })
    expect(w.rowsOf('projects').has('p1')).toBe(false)
  })
})
