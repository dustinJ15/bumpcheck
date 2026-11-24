/**
 * The five bumpcheck collections, checked with the SDK's own permission
 * functions (the ones the record room enforces), so the rules below are the
 * rules the server applies.
 */

import { describe, expect, it } from 'vitest'
import { canCreate, canDelete, canRead, canUpdate, lintSchemas } from 'deepspace/worker'
import type { CollectionSchema } from 'deepspace/schema'
import { schemas } from './schemas'

const ROLES = ['viewer', 'member', 'admin'] as const

function schema(name: string): CollectionSchema {
  const found = schemas.find((s) => s.name === name)
  if (!found) throw new Error(`schema ${name} is not registered`)
  return found
}

/** A row as the record room sees it. Server code creates every row, as the app owner. */
function row(data: Record<string, unknown>) {
  return { data, createdBy: 'app-owner', recordId: 'r1' }
}

const BUMPCHECK = ['projects', 'verdicts', 'alerts', 'usage', 'attempts']

describe('bumpcheck collections', () => {
  it('are all registered', () => {
    expect(schemas.map((s) => s.name)).toEqual(expect.arrayContaining(BUMPCHECK))
  })

  it('pass the SDK schema lint with no warnings', () => {
    expect(lintSchemas(BUMPCHECK.map(schema))).toEqual([])
  })

  it.each(BUMPCHECK)('%s: no client role can create, update or delete', (name) => {
    const s = schema(name)
    const anyRow = row({ userId: 'alice', visibility: 'public' })
    for (const role of ROLES) {
      expect(canCreate(s, role)).toBe(false)
      expect(canUpdate(s, role, anyRow, 'alice')).toBe(false)
      expect(canDelete(s, role, anyRow, 'alice')).toBe(false)
    }
  })
})

describe('projects', () => {
  const s = schema('projects')
  const alicePrivate = row({ userId: 'alice', visibility: 'private' })
  const alicePublic = row({ userId: 'alice', visibility: 'public' })

  it('carries the user id in the owner field and is private by default', () => {
    expect(s.ownerField).toBe('userId')
    expect(s.visibilityField).toBe('visibility')
    expect(s.columns.find((c) => c.name === 'visibility')?.default).toBe('private')
  })

  it('lets a member read their own private project, even though the owner context wrote it', () => {
    expect(canRead(s, 'member', alicePrivate, 'alice')).toBe(true)
  })

  it("hides a private project from other members and signed-out visitors", () => {
    expect(canRead(s, 'member', alicePrivate, 'bob')).toBe(false)
    expect(canRead(s, 'viewer', alicePrivate, 'anon-1')).toBe(false)
  })

  it('shows a public project to other members and signed-out visitors', () => {
    expect(canRead(s, 'member', alicePublic, 'bob')).toBe(true)
    expect(canRead(s, 'viewer', alicePublic, 'anon-1')).toBe(true)
  })

  it('has email alerts off by default', () => {
    expect(s.columns.find((c) => c.name === 'alertsEnabled')?.default).toBe(0)
  })
})

describe('verdicts', () => {
  it('are readable by every role, signed-out visitors included', () => {
    const s = schema('verdicts')
    for (const role of ROLES) expect(canRead(s, role, row({ key: 'express@4->5.1' }), 'anyone')).toBe(true)
  })
})

describe('alerts', () => {
  const s = schema('alerts')
  const aliceLog = row({ userId: 'alice', projectId: 'p1' })

  it('are readable only by the user they belong to', () => {
    expect(canRead(s, 'member', aliceLog, 'alice')).toBe(true)
    expect(canRead(s, 'member', aliceLog, 'bob')).toBe(false)
    expect(canRead(s, 'viewer', aliceLog, 'anon-1')).toBe(false)
  })
})

describe('usage', () => {
  it('is server-only: no role reads it', () => {
    const s = schema('usage')
    for (const role of ROLES) expect(canRead(s, role, row({ day: '2026-11-23' }), 'anyone')).toBe(false)
  })
})

describe('attempts', () => {
  const s = schema('attempts')

  it('is server-only: no role reads it, not even the user the row is about', () => {
    const aliceAttempt = row({ userId: 'alice', day: '2026-11-23' })
    for (const role of ROLES) expect(canRead(s, role, aliceAttempt, 'alice')).toBe(false)
  })

  it('keeps who and which day fixed once written', () => {
    for (const name of ['userId', 'day']) {
      expect(s.columns.find((c) => c.name === name)).toMatchObject({ required: true, immutable: true })
    }
  })
})

describe('projects: scan bookkeeping', () => {
  it('has a column for the scan\'s last sign of life, which the stalled-scan check reads', () => {
    expect(schema('projects').columns.map((c) => c.name)).toContain('scanHeartbeatAt')
  })
})
