/**
 * The add-project check, against the fake source host: one test per refusal
 * message, and proof that a refused request costs no GitHub call when the
 * answer is already known.
 */

import { describe, expect, it } from 'vitest'
import { LIMITS } from '../config'
import type { RepoRef } from '../core/model'
import { INVALID_REPO_INPUT_MESSAGE } from '../core/repo-input'
import { FakeSourceHost, type FakeRepo } from '../services/fakes'
import { checkNewProject, type AddAttempts, type NewProjectRequest } from './add-project'

function repoWith(packageJson: string | null): FakeRepo {
  return { defaultBranch: 'main', files: packageJson === null ? {} : { 'package.json': packageJson } }
}

function manyDependencies(count: number): string {
  const dependencies: Record<string, string> = {}
  for (let i = 0; i < count; i++) dependencies[`pkg-${i}`] = '^1.0.0'
  return JSON.stringify({ dependencies })
}

function host() {
  return new FakeSourceHost({
    repos: {
      'acme/good': { defaultBranch: 'trunk', files: { 'package.json': '{"dependencies":{"left-pad":"^1.0.0"}}' } },
      'acme/no-manifest': repoWith(null),
      'acme/bad-json': repoWith('{ not json'),
      'acme/at-the-limit': repoWith(manyDependencies(LIMITS.dependenciesPerProject)),
      'acme/too-many': repoWith(manyDependencies(LIMITS.dependenciesPerProject + 1)),
    },
  })
}

const NOW = Date.parse('2026-11-23T19:30:00.000Z')

function request(repoInput: unknown, overrides: Partial<NewProjectRequest> = {}): NewProjectRequest {
  return { repoInput, isAppOwner: false, existing: [], now: NOW, ...overrides }
}

/**
 * A user's add attempts today, in memory. `log` is shared with nothing
 * else, so tests that care about order pass their own list.
 */
function attempts(alreadyToday = 0, log: string[] = []) {
  const state = { count: alreadyToday, log }
  const counter: AddAttempts = {
    countToday: async () => state.count,
    record: async () => {
      state.log.push('record attempt')
      state.count += 1
      return state.count
    },
  }
  return Object.assign(counter, { state })
}

function projects(count: number): RepoRef[] {
  return Array.from({ length: count }, (_, i) => ({ owner: 'acme', repo: `existing-${i}` }))
}

describe('checkNewProject: accepts', () => {
  it('a public repo with a package.json, and reports its default branch', async () => {
    expect(await checkNewProject(request('acme/good'), host(), attempts())).toEqual({
      ok: true,
      repo: { owner: 'acme', repo: 'good' },
      defaultBranch: 'trunk',
    })
  })

  it('a GitHub URL, lowercased', async () => {
    const result = await checkNewProject(request('https://github.com/Acme/Good'), host(), attempts())
    expect(result).toMatchObject({ ok: true, repo: { owner: 'acme', repo: 'good' } })
  })

  it(`a package.json with exactly ${LIMITS.dependenciesPerProject} dependencies`, async () => {
    expect(await checkNewProject(request('acme/at-the-limit'), host(), attempts())).toMatchObject({ ok: true })
  })

  it('a user one project under the limit', async () => {
    const existing = projects(LIMITS.projectsPerUser - 1)
    expect(await checkNewProject(request('acme/good', { existing }), host(), attempts())).toMatchObject({ ok: true })
  })

  it('the app owner past the per-user limit', async () => {
    const existing = projects(LIMITS.projectsPerUser + 5)
    const result = await checkNewProject(request('acme/good', { existing, isAppOwner: true }), host(), attempts())
    expect(result).toMatchObject({ ok: true })
  })
})

describe('checkNewProject: each refusal has its own message', () => {
  it('input that is not a repo', async () => {
    expect(await checkNewProject(request('not a repo'), host(), attempts())).toEqual({
      ok: false,
      refusal: 'invalid-input',
      message: INVALID_REPO_INPUT_MESSAGE,
    })
  })

  it('a repo that does not exist or is private', async () => {
    expect(await checkNewProject(request('acme/missing'), host(), attempts())).toEqual({
      ok: false,
      refusal: 'repo-not-found',
      message: 'The repository was not found or is not public. bumpcheck reads public repositories only.',
    })
  })

  it('a repo with no root package.json', async () => {
    expect(await checkNewProject(request('acme/no-manifest'), host(), attempts())).toEqual({
      ok: false,
      refusal: 'no-package-json',
      message: 'The repository has no package.json at its root.',
    })
  })

  it('a package.json that is not valid JSON', async () => {
    expect(await checkNewProject(request('acme/bad-json'), host(), attempts())).toEqual({
      ok: false,
      refusal: 'invalid-json',
      message: 'package.json is not valid JSON.',
    })
  })

  it(`more than ${LIMITS.dependenciesPerProject} dependencies`, async () => {
    const over = LIMITS.dependenciesPerProject + 1
    expect(await checkNewProject(request('acme/too-many'), host(), attempts())).toEqual({
      ok: false,
      refusal: 'too-many-dependencies',
      message: `package.json declares ${over} dependencies; bumpcheck reads at most ${LIMITS.dependenciesPerProject}.`,
    })
  })

  it('the project limit', async () => {
    const existing = projects(LIMITS.projectsPerUser)
    expect(await checkNewProject(request('acme/good', { existing }), host(), attempts())).toEqual({
      ok: false,
      refusal: 'project-limit',
      message: `You have reached the limit of ${LIMITS.projectsPerUser} projects. Delete one to add another.`,
    })
  })

  it('the same repo already added by this user, whatever the letter case', async () => {
    const existing = [{ owner: 'acme', repo: 'good' }]
    for (const input of ['acme/good', 'Acme/GOOD', 'https://github.com/acme/good.git']) {
      expect(await checkNewProject(request(input, { existing }), host(), attempts())).toEqual({
        ok: false,
        refusal: 'duplicate',
        message: 'You have already added acme/good.',
      })
    }
  })
})

describe('checkNewProject: free checks come before the GitHub call', () => {
  it.each([
    ['invalid input', request('nope')],
    ['a duplicate', request('acme/good', { existing: [{ owner: 'acme', repo: 'good' }] })],
    ['the project limit', request('acme/good', { existing: projects(LIMITS.projectsPerUser) })],
  ])('%s makes no source-host call', async (_name, req) => {
    const sourceHost = host()
    const counter = attempts()
    expect(await checkNewProject(req, sourceHost, counter)).toMatchObject({ ok: false })
    expect(sourceHost.calls).toEqual([])
    // A request refused for free is not an attempt.
    expect(counter.state.count).toBe(0)
  })
})

describe('checkNewProject: add attempts are capped per user per day', () => {
  const cap = LIMITS.addAttemptsPerUserPerDay

  it(`allows attempt number ${cap} and counts it`, async () => {
    const counter = attempts(cap - 1)
    expect(await checkNewProject(request('acme/good'), host(), counter)).toMatchObject({ ok: true })
    expect(counter.state.count).toBe(cap)
  })

  it(`refuses attempt number ${cap + 1}, makes no GitHub call, and says when the limit resets`, async () => {
    const sourceHost = host()
    const counter = attempts(cap)
    expect(await checkNewProject(request('acme/good'), sourceHost, counter)).toEqual({
      ok: false,
      refusal: 'attempt-limit',
      // NOW is 19:30 UTC, so midnight UTC is four and a half hours away.
      message: `You have tried to add a project ${cap} times today, which is the daily limit. You can try again after midnight UTC, in about 5 hours.`,
    })
    expect(sourceHost.calls).toEqual([])
    expect(counter.state.count).toBe(cap)
  })

  it('counts an attempt even when GitHub then refuses the repo: that request cost money', async () => {
    const counter = attempts(3)
    expect(await checkNewProject(request('acme/missing'), host(), counter)).toMatchObject({ ok: false, refusal: 'repo-not-found' })
    expect(counter.state.count).toBe(4)
  })

  it('counts the attempt before the GitHub call is made', async () => {
    const log: string[] = []
    const sourceHost = host()
    const getRepo = sourceHost.getRepo.bind(sourceHost)
    sourceHost.getRepo = async (repo) => {
      log.push('GitHub call')
      return getRepo(repo)
    }
    await checkNewProject(request('acme/good'), sourceHost, attempts(0, log))
    expect(log).toEqual(['record attempt', 'GitHub call'])
  })

  it('refuses when requests sent at the same moment pushed the count past the cap', async () => {
    // Both requests read "19 so far"; by the time this one has recorded its own, there are 21.
    const sourceHost = host()
    const counter: AddAttempts = { countToday: async () => cap - 1, record: async () => cap + 1 }
    expect(await checkNewProject(request('acme/good'), sourceHost, counter)).toMatchObject({ ok: false, refusal: 'attempt-limit' })
    expect(sourceHost.calls).toEqual([])
  })

  it('exempts the app owner (a per-user limit), and still counts', async () => {
    const counter = attempts(cap + 50)
    expect(await checkNewProject(request('acme/good', { isAppOwner: true }), host(), counter)).toMatchObject({ ok: true })
    expect(counter.state.count).toBe(cap + 51)
  })

  it('says "1 hour", not "1 hours", an hour before the reset', async () => {
    const now = Date.parse('2026-11-23T23:00:00.000Z')
    const result = await checkNewProject(request('acme/good', { now }), host(), attempts(cap))
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('in about 1 hour.') })
  })

  it('gives the wait in minutes when the reset is under an hour away', async () => {
    const now = Date.parse('2026-11-23T23:48:00.000Z')
    const result = await checkNewProject(request('acme/good', { now }), host(), attempts(cap))
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('in about 12 minutes.') })
  })
})
