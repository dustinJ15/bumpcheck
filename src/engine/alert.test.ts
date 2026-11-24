/**
 * Engine tests for email alerts: whole scans in memory with the real alert
 * step behind the scan's alert hook, a fake mailer, and a throwaway signing
 * key. No mail is sent and nothing outside this file is read.
 */

import { describe, expect, it } from 'vitest'
import { LIMITS } from '../config'
import { verifyUnsubscribeToken } from '../core/unsubscribe-token'
import {
  FakeClock,
  FakeJudge,
  FakeMailer,
  FakeRegistry,
  FakeSourceHost,
  MemoryRecordStore,
  type FakeJudgeResponder,
  type FakeMailResponder,
} from '../services/fakes'
import type { MailResult, RegistryPackage } from '../services/types'
import { alertHookFor, runAlertStep, sendTestEmail, type AlertServices, type TestEmailCount } from './alert'
import { runScan, startScan, type ScanServices } from './scan'

const PROJECT = 'project-1'
const USER = 'user-1'
const ADDRESS = 'dustin@example.test'
const ORIGIN = 'https://bumpcheck.example'
/** Made up for these tests. The real key is never read by a test. */
const KEY = 'throwaway-test-key-not-a-secret'
const DAY = 24 * 60 * 60 * 1000

function pkg(name: string, latest: string): RegistryPackage {
  return { latest, versions: [latest], source: { owner: 'acme', repo: name } }
}

/** Breaking for every package, except the ones a test names as safe. */
function responder(safe: string[] = []): FakeJudgeResponder {
  return (input) =>
    safe.includes(input.packageName)
      ? { label: 'safe', summary: `${input.packageName} is fine.`, changes: [] }
      : {
          label: 'breaking',
          summary: `${input.packageName} ${input.toVersion} removed an API.`,
          changes: [
            { title: 'Removed', whatChanged: 'An API was removed.', apiNames: ['old'], whatToDo: `Stop calling old() in ${input.packageName}.` },
          ],
        }
}

interface WorldOptions {
  alertsEnabled?: boolean
  mail?: MailResult | FakeMailResponder
  signingKey?: string
  appOrigin?: string | null
  safe?: string[]
}

/**
 * One repo with two dependencies a major behind (zod and chalk), one project
 * owned by USER with alerts on, and a fake for every service.
 */
function world(options: WorldOptions = {}) {
  const packages: Record<string, RegistryPackage> = { zod: pkg('zod', '4.0.0'), chalk: pkg('chalk', '5.0.0') }
  const manifest = { dependencies: { zod: '^3.0.0', chalk: '^4.0.0' } as Record<string, string> }
  const files = { 'package.json': JSON.stringify(manifest) }
  const changelogs: Record<string, string> = {
    'acme/zod': '## 4.0.0\n- BREAKING: removed old()',
    'acme/chalk': '## 5.0.0\n- BREAKING: removed old()',
  }
  const store = new MemoryRecordStore()
  const clock = new FakeClock()
  const mailer = new FakeMailer(options.mail)
  store.seedProject({
    id: PROJECT,
    userId: USER,
    repoOwner: 'dustin',
    repoName: 'app',
    alertsEnabled: options.alertsEnabled ?? true,
    lastOpenedAt: new Date(clock.now()).toISOString(),
  })
  store.userEmails.set(USER, ADDRESS)

  const alertServices: AlertServices = {
    store,
    mailer,
    clock,
    appOrigin: options.appOrigin === undefined ? ORIGIN : options.appOrigin,
    signingKey: 'signingKey' in options ? options.signingKey : KEY,
  }
  const judge = new FakeJudge(responder(options.safe))
  const services: ScanServices = {
    registry: new FakeRegistry(packages),
    sourceHost: new FakeSourceHost({ repos: { 'dustin/app': { defaultBranch: 'main', files } }, changelogs }),
    judge,
    store,
    clock,
    alertHook: alertHookFor(alertServices),
  }

  return {
    store,
    clock,
    mailer,
    judge,
    services,
    alertServices,
    /** A full scan, as the daily schedule or "scan now" runs it. */
    scan: () => runScan(services, startScan(PROJECT)),
    /** A "check this one" scan of the named dependency. */
    async check(name: string) {
      await store.updateProject(PROJECT, { checkRequests: [name] })
      return runScan(services, startScan(PROJECT, { onDemand: true }))
    },
    /** A new major of a package comes out, with a changelog section for it. */
    release(name: string, version: string) {
      packages[name] = pkg(name, version)
      changelogs[`acme/${name}`] = `## ${version}\n- BREAKING: removed old() again\n\n${changelogs[`acme/${name}`] ?? ''}`
    },
    /** Adds a dependency a major behind to the repo's package.json. */
    addDependency(name: string, range: string, latest: string) {
      packages[name] = pkg(name, latest)
      manifest.dependencies[name] = range
      files['package.json'] = JSON.stringify(manifest)
      changelogs[`acme/${name}`] = `## ${latest}\n- BREAKING: removed old()`
    },
    project() {
      const p = store.projects.get(PROJECT)
      if (!p) throw new Error('project missing')
      return p
    },
    log: () => store.alerts.filter((entry) => entry.projectId === PROJECT),
  }
}

const ZOD = 'zod@3->4.0'
const CHALK = 'chalk@4->5.0'

describe('an alert after a daily scan', () => {
  it('sends one email to the owner\'s sign-in address, naming the repo and the count', async () => {
    const w = world()
    const state = await w.scan()

    expect(state.outcome).toBe('succeeded')
    expect(w.mailer.calls).toHaveLength(1)
    const message = w.mailer.calls[0]
    expect(message.to).toBe(ADDRESS)
    expect(message.subject).toBe('bumpcheck: 2 new breaking upgrades in dustin/app')
    expect(message.text).toContain('zod')
    expect(message.text).toContain('3.0.0 → 4.0.0')
    expect(message.text).toContain('Stop calling old() in chalk.')
    expect(message.html).toContain(`${ORIGIN}/projects/${PROJECT}`)
  })

  it('logs the outcome and records which verdicts were alerted', async () => {
    const w = world()
    await w.scan()

    expect(w.log()).toEqual([
      {
        projectId: PROJECT,
        userId: USER,
        sentAt: new Date(w.clock.now()).toISOString(),
        kind: 'alert',
        outcome: 'sent',
        verdictKeys: [CHALK, ZOD],
        failureReason: null,
      },
    ])
    expect([...w.project().alertedKeys].sort()).toEqual([CHALK, ZOD])
  })

  it('carries a one-click unsubscribe link signed for this project', async () => {
    const w = world()
    await w.scan()

    const headers = w.mailer.calls[0].headers
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const link = /^<(.+)>$/.exec(headers['List-Unsubscribe'])?.[1] ?? ''
    expect(link.startsWith(`${ORIGIN}/api/unsubscribe?token=`)).toBe(true)
    expect(await verifyUnsubscribeToken(new URL(link).searchParams.get('token'), KEY)).toEqual({ ok: true, projectId: PROJECT })
    // The same link is in both bodies.
    expect(w.mailer.calls[0].text).toContain(link)
    expect(w.mailer.calls[0].html).toContain(link.replaceAll('&', '&amp;'))
  })

  it('sets no reply-to when the app has none configured', async () => {
    const w = world()
    await w.scan()
    expect('replyTo' in w.mailer.calls[0]).toBe(false)
  })
})

describe('never the same news twice', () => {
  it('an alert is sent once and never repeated by later scans', async () => {
    const w = world()
    await w.scan()
    for (let day = 0; day < 3; day++) {
      w.clock.advance(DAY)
      await w.scan()
    }
    expect(w.mailer.calls).toHaveLength(1)
    expect(w.log()).toHaveLength(1)
  })

  it('a newer breaking verdict for the same package is news: one more email, with only that verdict', async () => {
    const w = world()
    await w.scan()
    w.release('zod', '5.0.0')
    w.clock.advance(DAY)
    await w.scan()

    expect(w.mailer.calls).toHaveLength(2)
    expect(w.mailer.calls[1].subject).toBe('bumpcheck: 1 new breaking upgrade in dustin/app')
    expect(w.log()[1].verdictKeys).toEqual(['zod@3->5.0'])
    expect(w.mailer.calls[1].text).not.toContain('chalk')
  })

  it('is not repeated when the send log could not be written: the project row remembers', async () => {
    const w = world()
    w.store.failing.add('addAlert')
    await w.scan()
    expect(w.mailer.calls).toHaveLength(1)
    expect(w.log()).toHaveLength(0)

    w.store.failing.clear()
    w.clock.advance(DAY)
    await w.scan()
    expect(w.mailer.calls).toHaveLength(1)
  })

  it('is not repeated when the project row could not be updated: the send log remembers', async () => {
    const w = world()
    w.store.failing.add('setAlertedKeys')
    const state = await w.scan()
    expect(state.outcome).toBe('succeeded')
    expect(w.mailer.calls).toHaveLength(1)
    expect(w.project().alertedKeys).toEqual([])

    w.store.failing.clear()
    w.clock.advance(DAY)
    await w.scan()
    expect(w.mailer.calls).toHaveLength(1)
  })

  it('keeps the keys alerted earlier when it records new ones', async () => {
    const w = world()
    await w.scan()
    w.release('zod', '5.0.0')
    w.clock.advance(DAY)
    await w.scan()
    expect([...w.project().alertedKeys].sort()).toEqual([CHALK, ZOD, 'zod@3->5.0'].sort())
  })
})

describe('what is not alerted', () => {
  it('reviewed verdicts are not alerted', async () => {
    const w = world({ alertsEnabled: false })
    await w.scan()
    // The owner reads the page, marks zod as reviewed, then turns alerts on.
    w.store.projects.set(PROJECT, { ...w.project(), reviewedKeys: [ZOD], alertsEnabled: true })
    w.clock.advance(DAY)
    await w.scan()

    expect(w.mailer.calls).toHaveLength(1)
    expect(w.mailer.calls[0].subject).toBe('bumpcheck: 1 new breaking upgrade in dustin/app')
    expect(w.log()[0].verdictKeys).toEqual([CHALK])
    expect(w.mailer.calls[0].text).not.toContain('zod')
  })

  it('sends nothing when every breaking verdict is reviewed', async () => {
    const w = world({ alertsEnabled: false })
    await w.scan()
    w.store.projects.set(PROJECT, { ...w.project(), reviewedKeys: [ZOD, CHALK], alertsEnabled: true })
    w.clock.advance(DAY)
    await w.scan()
    expect(w.mailer.calls).toHaveLength(0)
    expect(w.log()).toHaveLength(0)
  })

  it('alerts off sends nothing and logs nothing', async () => {
    const w = world({ alertsEnabled: false })
    await w.scan()
    expect(w.mailer.calls).toHaveLength(0)
    expect(w.log()).toHaveLength(0)
    expect(w.project().alertedKeys).toEqual([])
  })

  it('a verdict that is not breaking is not alerted', async () => {
    const w = world({ safe: ['zod', 'chalk'] })
    await w.scan()
    expect(w.mailer.calls).toHaveLength(0)
    expect(w.log()).toHaveLength(0)
  })

  it('on-demand reads do not alert, even with breaking verdicts waiting', async () => {
    const w = world({ alertsEnabled: false })
    await w.scan()
    w.store.projects.set(PROJECT, { ...w.project(), alertsEnabled: true })

    const state = await w.check('zod')
    expect(state.outcome).toBe('succeeded')
    expect(w.mailer.calls).toHaveLength(0)
    expect(w.log()).toHaveLength(0)

    // The next daily scan does.
    w.clock.advance(DAY)
    await w.scan()
    expect(w.mailer.calls).toHaveLength(1)
  })

  it('a project that was deleted during its scan gets nothing', async () => {
    const w = world()
    expect(await runAlertStep(w.alertServices, 'no-such-project')).toEqual({ sent: false, why: 'project-gone' })
    expect(w.mailer.calls).toHaveLength(0)
  })
})

describe('at most one alert email per project per day', () => {
  it('no second alert the same day; the new verdict goes out with the next day\'s scan', async () => {
    const w = world()
    await w.scan()
    expect(w.mailer.calls).toHaveLength(1)

    // A new breaking upgrade appears and the owner presses "scan now" an hour later.
    w.addDependency('yargs', '^17.0.0', '18.0.0')
    w.clock.advance(60 * 60 * 1000)
    const state = await w.scan()
    expect(state.outcome).toBe('succeeded')
    expect(w.mailer.calls).toHaveLength(1)
    expect(w.log()).toHaveLength(1)

    w.clock.advance(DAY)
    await w.scan()
    expect(w.mailer.calls).toHaveLength(2)
    expect(w.log()[1].verdictKeys).toEqual(['yargs@17->18.0'])
    expect(LIMITS.alertEmailsPerProjectPerDay).toBe(1)
  })

  it('the day is the UTC day: an alert late on one day does not block one early the next', async () => {
    const w = world()
    w.clock.advance(11 * 60 * 60 * 1000 + 30 * 60 * 1000) // 23:30 UTC
    await w.scan()
    w.addDependency('yargs', '^17.0.0', '18.0.0')
    w.clock.advance(60 * 60 * 1000) // 00:30 UTC the next day
    await w.scan()
    expect(w.mailer.calls).toHaveLength(2)
  })

  it('a test email the same day does not use up the alert', async () => {
    const w = world({ alertsEnabled: false })
    await w.scan()
    await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count: counter() })
    w.store.projects.set(PROJECT, { ...w.project(), alertsEnabled: true })
    w.clock.advance(60 * 60 * 1000)
    await w.scan()
    expect(w.mailer.calls.map((m) => m.subject)).toEqual([
      '[Test] bumpcheck: 2 new breaking upgrades in dustin/app',
      'bumpcheck: 2 new breaking upgrades in dustin/app',
    ])
  })
})

describe('a failed send', () => {
  const down: MailResult = { ok: false, error: 'The mail service answered 503.' }

  it('is logged as failed with its reason, and the verdicts are not marked as alerted', async () => {
    const w = world({ mail: down })
    const state = await w.scan()

    expect(state.outcome).toBe('succeeded')
    expect(w.log()).toMatchObject([{ kind: 'alert', outcome: 'failed', failureReason: 'The mail service answered 503.', verdictKeys: [CHALK, ZOD] }])
    expect(w.project().alertedKeys).toEqual([])
  })

  it('retries once on the next scan, then stays failed', async () => {
    const w = world({ mail: down })
    await w.scan()
    w.clock.advance(DAY)
    await w.scan()
    expect(w.mailer.calls).toHaveLength(2)
    expect(w.log().map((entry) => entry.outcome)).toEqual(['failed', 'failed'])

    for (let day = 0; day < 3; day++) {
      w.clock.advance(DAY)
      await w.scan()
    }
    expect(w.mailer.calls).toHaveLength(2)
    expect(w.log()).toHaveLength(2)
    expect(LIMITS.alertSendAttemptsPerVerdict).toBe(2)
  })

  it('when the retry works, the alert is sent and never again', async () => {
    const w = world({ mail: (_message, attempt) => (attempt === 1 ? down : { ok: true }) })
    await w.scan()
    w.clock.advance(DAY)
    await w.scan()
    w.clock.advance(DAY)
    await w.scan()

    expect(w.mailer.calls).toHaveLength(2)
    expect(w.log().map((entry) => entry.outcome)).toEqual(['failed', 'sent'])
    expect([...w.project().alertedKeys].sort()).toEqual([CHALK, ZOD])
  })

  it('a verdict that was given up on does not hold back a newer one', async () => {
    const w = world({ mail: (_message, attempt) => (attempt <= 2 ? down : { ok: true }) })
    await w.scan()
    w.clock.advance(DAY)
    await w.scan()
    w.release('zod', '5.0.0')
    w.clock.advance(DAY)
    await w.scan()

    expect(w.mailer.calls).toHaveLength(3)
    expect(w.log()[2]).toMatchObject({ outcome: 'sent', verdictKeys: ['zod@3->5.0'] })
  })

  it('a mailer that throws is a failed send, not a failed scan', async () => {
    const w = world({
      mail: () => {
        throw new Error('socket hang up')
      },
    })
    const state = await w.scan()
    expect(state.outcome).toBe('succeeded')
    expect(w.project().scanStatus).toBe('done')
    expect(w.log()).toMatchObject([{ outcome: 'failed', failureReason: 'socket hang up' }])
  })

  it('a failed send the same day does not count as the day\'s alert', async () => {
    const w = world({ mail: (_message, attempt) => (attempt === 1 ? down : { ok: true }) })
    await w.scan()
    w.clock.advance(60 * 60 * 1000)
    await w.scan()
    expect(w.log().map((entry) => entry.outcome)).toEqual(['failed', 'sent'])
  })
})

describe('an alert that cannot be sent safely is not sent', () => {
  it('no signing key: nothing is sent, because the email would have no working unsubscribe link', async () => {
    for (const signingKey of [undefined, '']) {
      const w = world({ signingKey })
      const state = await w.scan()
      expect(state.outcome).toBe('succeeded')
      expect(w.mailer.calls).toHaveLength(0)
      expect(w.log()).toMatchObject([{ outcome: 'failed', failureReason: 'Unsubscribe links cannot be signed: the signing key is not set.' }])
      expect(w.project().alertedKeys).toEqual([])
    }
  })

  it('a setup problem is not a try at sending: once it is fixed the alert goes out, however many scans ran meanwhile', async () => {
    const w = world({ signingKey: undefined })
    for (let day = 0; day < 4; day++) {
      await w.scan()
      w.clock.advance(DAY)
    }
    expect(w.mailer.calls).toHaveLength(0)
    // Each one is in the log for the owner to see, but names no verdict, so none is given up on.
    expect(w.log().map((entry) => [entry.outcome, entry.verdictKeys])).toEqual(Array(4).fill(['failed', []]))

    w.alertServices.signingKey = KEY
    await w.scan()
    expect(w.mailer.calls).toHaveLength(1)
    expect(w.log()[4]).toMatchObject({ outcome: 'sent', verdictKeys: [CHALK, ZOD] })
  })

  it('no sign-in address on record: nothing is sent', async () => {
    const w = world()
    w.store.userEmails.clear()
    await w.scan()
    expect(w.mailer.calls).toHaveLength(0)
    expect(w.log()).toMatchObject([{ outcome: 'failed', failureReason: 'No sign-in address is on record for this account.' }])
  })

  it('no app origin: nothing is sent, because the links would point nowhere', async () => {
    const w = world({ appOrigin: null })
    await w.scan()
    expect(w.mailer.calls).toHaveLength(0)
    expect(w.log()).toMatchObject([{ outcome: 'failed', failureReason: 'The app does not know its own address.' }])
  })

  it('the recipient is the project owner\'s address and nobody else\'s', async () => {
    const w = world()
    w.store.userEmails.set('user-2', 'someone-else@example.test')
    await w.scan()
    expect(w.mailer.calls.map((m) => m.to)).toEqual([ADDRESS])
    expect(w.store.calls.filter((c) => c.method === 'getUserEmail').map((c) => c.arg)).toEqual([USER])
  })
})

describe('a problem in the alert step never fails the scan', () => {
  it('the scan still succeeds when the send log cannot be read, and nothing is sent blind', async () => {
    const w = world()
    w.store.failing.add('listAlerts')
    const state = await w.scan()
    expect(state.outcome).toBe('succeeded')
    expect(w.project().scanStatus).toBe('done')
    expect(w.mailer.calls).toHaveLength(0)
  })
})

// ------------------------------------------------------------ test emails

/** A user's test-email count for today, as the server action keeps it in records. */
function counter(start = 0): TestEmailCount & { recorded: number } {
  const state = {
    recorded: start,
    countToday: async () => state.recorded,
    record: async () => ++state.recorded,
  }
  return state
}

describe('send me a test', () => {
  it('sends a test email to the sign-in address and logs it as kind "test"', async () => {
    const w = world({ alertsEnabled: false })
    await w.scan()
    const result = await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count: counter() })

    expect(result).toEqual({ ok: true, remaining: LIMITS.testEmailsPerUserPerDay - 1 })
    expect(w.mailer.calls).toHaveLength(1)
    expect(w.mailer.calls[0].to).toBe(ADDRESS)
    expect(w.mailer.calls[0].subject).toBe('[Test] bumpcheck: 2 new breaking upgrades in dustin/app')
    expect(w.mailer.calls[0].headers['List-Unsubscribe']).toContain(`${ORIGIN}/api/unsubscribe?token=`)
    expect(w.log()).toMatchObject([{ kind: 'test', outcome: 'sent', userId: USER, verdictKeys: [CHALK, ZOD] }])
  })

  it('does not mark anything as alerted: the real alert still goes out', async () => {
    const w = world({ alertsEnabled: false })
    await w.scan()
    await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count: counter() })
    expect(w.project().alertedKeys).toEqual([])

    w.store.projects.set(PROJECT, { ...w.project(), alertsEnabled: true })
    w.clock.advance(DAY)
    await w.scan()
    expect(w.mailer.calls).toHaveLength(2)
    expect(w.mailer.calls[1].subject).toBe('bumpcheck: 2 new breaking upgrades in dustin/app')
  })

  it('shows the project\'s breaking upgrades even after an alert has gone out for them: a test is a preview', async () => {
    const w = world()
    await w.scan()
    expect(w.project().alertedKeys).toHaveLength(2)
    await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count: counter() })
    expect(w.mailer.calls[1].subject).toBe('[Test] bumpcheck: 2 new breaking upgrades in dustin/app')
    expect(w.mailer.calls[1].text).not.toContain('made-up example')
  })

  it('shows the built-in example when the project has nothing breaking', async () => {
    const w = world({ safe: ['zod', 'chalk'] })
    await w.scan()
    await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count: counter() })
    expect(w.mailer.calls[0].text).toContain('made-up example')
    expect(w.log()).toMatchObject([{ kind: 'test', outcome: 'sent', verdictKeys: [] }])
  })

  it('the third of the day is sent; the fourth is refused, sends nothing and logs nothing', async () => {
    const w = world()
    const count = counter()
    for (let i = 0; i < LIMITS.testEmailsPerUserPerDay; i++) {
      expect(await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count })).toMatchObject({ ok: true })
    }
    expect(w.mailer.calls).toHaveLength(3)

    const fourth = await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count })
    expect(fourth).toEqual({
      ok: false,
      refusal: 'test-limit',
      message: 'You have sent 3 test emails today, which is the daily limit. You can send more after midnight UTC, in about 12 hours.',
      remaining: 0,
    })
    expect(w.mailer.calls).toHaveLength(3)
    expect(w.log()).toHaveLength(3)
    // A refused request is not counted.
    expect(count.recorded).toBe(3)
  })

  it('says how many are left after each one', async () => {
    const w = world()
    const count = counter()
    const left: Array<number | null> = []
    for (let i = 0; i < 3; i++) left.push((await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count })).remaining)
    expect(left).toEqual([2, 1, 0])
  })

  it('counts the email before it is sent', async () => {
    const order: string[] = []
    const w = world({
      mail: () => {
        order.push('send')
        return { ok: true }
      },
    })
    const count: TestEmailCount = {
      countToday: async () => 0,
      record: async () => {
        order.push('count')
        return 1
      },
    }
    await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count })
    expect(order).toEqual(['count', 'send'])
  })

  it('requests sent at the same moment cannot pass the cap: the count is looked at again after counting this one', async () => {
    const w = world()
    // Each request read "2 sent" before any of them was counted; counted, this one is the 4th.
    const count: TestEmailCount = { countToday: async () => 2, record: async () => 4 }
    const result = await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count })
    expect(result).toMatchObject({ ok: false, refusal: 'test-limit' })
    expect(w.mailer.calls).toHaveLength(0)
  })

  it('the app owner is exempt from the cap (a per-user limit)', async () => {
    const w = world()
    const count = counter(LIMITS.testEmailsPerUserPerDay + 5)
    const result = await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: true, count })
    expect(result).toEqual({ ok: true, remaining: null })
    expect(w.mailer.calls).toHaveLength(1)
  })

  it('a test email that cannot be sent is logged as failed, and still counts', async () => {
    const w = world({ mail: { ok: false, error: 'The mail service answered 503.' } })
    const count = counter()
    const result = await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count })
    expect(result).toEqual({
      ok: false,
      refusal: 'send-failed',
      message: 'The test email could not be sent: The mail service answered 503.',
      remaining: 2,
    })
    expect(w.log()).toMatchObject([{ kind: 'test', outcome: 'failed', failureReason: 'The mail service answered 503.' }])
    expect(count.recorded).toBe(1)
  })

  it('is not sent without a signing key', async () => {
    const w = world({ signingKey: undefined })
    const result = await sendTestEmail(w.alertServices, { projectId: PROJECT, isAppOwner: false, count: counter() })
    expect(result).toMatchObject({ ok: false, refusal: 'send-failed' })
    expect(w.mailer.calls).toHaveLength(0)
  })

  it('a project that does not exist gets no email and uses no allowance', async () => {
    const w = world()
    const count = counter()
    const result = await sendTestEmail(w.alertServices, { projectId: 'no-such-project', isAppOwner: false, count })
    expect(result).toMatchObject({ ok: false, refusal: 'project-gone' })
    expect(w.mailer.calls).toHaveLength(0)
    expect(count.recorded).toBe(0)
  })
})
