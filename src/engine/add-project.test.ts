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
import { checkNewProject, type NewProjectRequest } from './add-project'

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

function request(repoInput: unknown, overrides: Partial<NewProjectRequest> = {}): NewProjectRequest {
  return { repoInput, isAppOwner: false, existing: [], ...overrides }
}

function projects(count: number): RepoRef[] {
  return Array.from({ length: count }, (_, i) => ({ owner: 'acme', repo: `existing-${i}` }))
}

describe('checkNewProject: accepts', () => {
  it('a public repo with a package.json, and reports its default branch', async () => {
    expect(await checkNewProject(request('acme/good'), host())).toEqual({
      ok: true,
      repo: { owner: 'acme', repo: 'good' },
      defaultBranch: 'trunk',
    })
  })

  it('a GitHub URL, lowercased', async () => {
    const result = await checkNewProject(request('https://github.com/Acme/Good'), host())
    expect(result).toMatchObject({ ok: true, repo: { owner: 'acme', repo: 'good' } })
  })

  it(`a package.json with exactly ${LIMITS.dependenciesPerProject} dependencies`, async () => {
    expect(await checkNewProject(request('acme/at-the-limit'), host())).toMatchObject({ ok: true })
  })

  it('a user one project under the limit', async () => {
    const existing = projects(LIMITS.projectsPerUser - 1)
    expect(await checkNewProject(request('acme/good', { existing }), host())).toMatchObject({ ok: true })
  })

  it('the app owner past the per-user limit', async () => {
    const existing = projects(LIMITS.projectsPerUser + 5)
    const result = await checkNewProject(request('acme/good', { existing, isAppOwner: true }), host())
    expect(result).toMatchObject({ ok: true })
  })
})

describe('checkNewProject: each refusal has its own message', () => {
  it('input that is not a repo', async () => {
    expect(await checkNewProject(request('not a repo'), host())).toEqual({
      ok: false,
      refusal: 'invalid-input',
      message: INVALID_REPO_INPUT_MESSAGE,
    })
  })

  it('a repo that does not exist or is private', async () => {
    expect(await checkNewProject(request('acme/missing'), host())).toEqual({
      ok: false,
      refusal: 'repo-not-found',
      message: 'The repository was not found or is not public.',
    })
  })

  it('a repo with no root package.json', async () => {
    expect(await checkNewProject(request('acme/no-manifest'), host())).toEqual({
      ok: false,
      refusal: 'no-package-json',
      message: 'The repository has no package.json at its root.',
    })
  })

  it('a package.json that is not valid JSON', async () => {
    expect(await checkNewProject(request('acme/bad-json'), host())).toEqual({
      ok: false,
      refusal: 'invalid-json',
      message: 'package.json is not valid JSON.',
    })
  })

  it(`more than ${LIMITS.dependenciesPerProject} dependencies`, async () => {
    const over = LIMITS.dependenciesPerProject + 1
    expect(await checkNewProject(request('acme/too-many'), host())).toEqual({
      ok: false,
      refusal: 'too-many-dependencies',
      message: `package.json declares ${over} dependencies; bumpcheck reads at most ${LIMITS.dependenciesPerProject}.`,
    })
  })

  it('the project limit', async () => {
    const existing = projects(LIMITS.projectsPerUser)
    expect(await checkNewProject(request('acme/good', { existing }), host())).toEqual({
      ok: false,
      refusal: 'project-limit',
      message: `You have reached the limit of ${LIMITS.projectsPerUser} projects. Delete one to add another.`,
    })
  })

  it('the same repo already added by this user, whatever the letter case', async () => {
    const existing = [{ owner: 'acme', repo: 'good' }]
    for (const input of ['acme/good', 'Acme/GOOD', 'https://github.com/acme/good.git']) {
      expect(await checkNewProject(request(input, { existing }), host())).toEqual({
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
    expect(await checkNewProject(req, sourceHost)).toMatchObject({ ok: false })
    expect(sourceHost.calls).toEqual([])
  })
})
