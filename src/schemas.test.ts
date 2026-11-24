/**
 * The bumpcheck collections, checked with the SDK's own permission
 * functions (the ones the record room enforces), so the rules below are the
 * rules the server applies.
 */

import { describe, expect, it } from 'vitest'
import { canCreate, canDelete, canRead, canUpdate, lintSchemas } from 'deepspace/worker'
import type { CollectionSchema } from 'deepspace/schema'
import { PUBLIC_REPORT_COLUMNS } from './core/public-report'
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

const BUMPCHECK = ['projects', 'publicReports', 'verdicts', 'alerts', 'usage', 'attempts', 'outbox']

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
    expect(s.columns.find((c) => c.name === 'visibility')?.default).toBe('private')
  })

  it('lets a member read their own private project, even though the owner context wrote it', () => {
    expect(canRead(s, 'member', alicePrivate, 'alice')).toBe(true)
  })

  it("hides a private project from other members and signed-out visitors", () => {
    expect(canRead(s, 'member', alicePrivate, 'bob')).toBe(false)
    expect(canRead(s, 'viewer', alicePrivate, 'anon-1')).toBe(false)
  })

  // Ticket 05: a project row carries its owner's id and the platform sends
  // whole rows, so nobody but the owner reads one, public or not. What the
  // public sees is the separate `publicReports` collection.
  it('is owner-only even when public: the row holds the owner id, so nobody else reads it', () => {
    expect(canRead(s, 'member', alicePublic, 'alice')).toBe(true)
    for (const role of ROLES) {
      expect(canRead(s, role, alicePublic, 'bob')).toBe(false)
      expect(canRead(s, role, alicePublic, 'anon-1')).toBe(false)
    }
  })

  it('has email alerts off by default', () => {
    expect(s.columns.find((c) => c.name === 'alertsEnabled')?.default).toBe(0)
  })
})

describe('publicReports', () => {
  const s = schema('publicReports')

  it('is readable by every role, signed-out visitors included', () => {
    for (const role of ROLES) expect(canRead(s, role, row({ projectId: 'p1' }), 'anyone')).toBe(true)
  })

  it('has exactly the columns a public report holds, and none that names a user', () => {
    expect(s.columns.map((c) => c.name)).toEqual([...PUBLIC_REPORT_COLUMNS])
    expect(s.ownerField).toBeUndefined()
    expect(s.columns.filter((c) => c.userBound)).toEqual([])
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

  it('keeps who, which day and what kind fixed once written', () => {
    for (const name of ['userId', 'day', 'kind']) {
      expect(s.columns.find((c) => c.name === name)).toMatchObject({ required: true, immutable: true })
    }
  })

  it('counts two kinds of request apart: adding a project and sending a test email', () => {
    expect(s.columns.find((c) => c.name === 'kind')?.interpretation).toEqual({ kind: 'select', options: ['add-project', 'test-email'] })
  })
})

describe('alerts: the send log', () => {
  it('has what the settings page shows: time, kind, outcome and failure reason', () => {
    const columns = schema('alerts').columns.map((c) => c.name)
    expect(columns).toEqual(expect.arrayContaining(['sentAt', 'kind', 'outcome', 'failureReason', 'verdictKeys', 'projectId']))
  })

  it('holds no address: the recipient is never written to a row a client can read', () => {
    const columns = schema('alerts').columns.map((c) => c.name)
    expect(columns.filter((name) => /mail|address|recipient|^to$/i.test(name))).toEqual([])
  })
})

describe('where an email address may be stored', () => {
  it('nowhere a client reads except the platform\'s own users collection', () => {
    for (const name of ['projects', 'publicReports', 'verdicts', 'alerts']) {
      const columns = schema(name).columns.map((c) => c.name)
      expect(columns.filter((column) => /mail|address|recipient|^to$/i.test(column)), name).toEqual([])
    }
  })
})

describe('outbox: what the fake mailer "sent" on the local test server', () => {
  it('is server-only: no role reads it, so a message is seen only through the test-only action', () => {
    const s = schema('outbox')
    const message = row({ to: 'alice@example.test', subject: 'hello' })
    for (const role of ROLES) expect(canRead(s, role, message, 'alice')).toBe(false)
  })
})

describe('projects: scan bookkeeping', () => {
  it('has a column for the scan\'s last sign of life, which the stalled-scan check reads', () => {
    expect(schema('projects').columns.map((c) => c.name)).toContain('scanHeartbeatAt')
  })
})
