/**
 * The fake outside world the local test server runs against.
 *
 * When the fake-services setting is on (./mode.ts), the worker uses this
 * instead of npm, GitHub and Claude, so a browser test can add a project and
 * watch a whole scan finish without one outside call. Records are not faked:
 * they go to the real local record room.
 *
 * Everything is fixed data, so every isolate (the action's and the job
 * room's) builds the same world. Every name is in the `bumpcheck-fake`
 * namespace so nothing here can be mistaken for, or collide with, a real
 * repo or package.
 *
 * `bumpcheck-fake/demo` has one dependency for each state a scan can produce:
 *
 *   @bumpcheck-fake/router       major, changelog file   -> breaking verdict
 *   @bumpcheck-fake/dates        major, no changelog     -> "no changelog found"
 *   @bumpcheck-fake/colors       minor                   -> not read
 *   @bumpcheck-fake/tiny         up to date
 *   local-thing                  a file: path            -> not checked
 *   @bumpcheck-fake/test-runner  dev, major, releases    -> safe verdict
 *   @bumpcheck-fake/types        dev, 0.x minor          -> unclear verdict
 */

import {
  defaultFakeResponder,
  FakeJudge,
  FakeRegistry,
  FakeSourceHost,
  type FakeJudgeResponder,
  type FakeRepo,
  type FakeSourceHostData,
} from './fakes'
import type { Judge, PackageRegistry, RegistryPackage, SourceHost } from './types'

export const FAKE_OWNER = 'bumpcheck-fake'

function fakePackage(name: string, latest: string, hasSource = true): [string, RegistryPackage] {
  return [
    `@${FAKE_OWNER}/${name}`,
    { latest, versions: [latest], source: hasSource ? { owner: FAKE_OWNER, repo: name } : null },
  ]
}

const PACKAGES: Record<string, RegistryPackage> = Object.fromEntries([
  fakePackage('router', '5.1.0'),
  fakePackage('dates', '4.1.0'),
  fakePackage('colors', '5.4.1'),
  fakePackage('tiny', '1.0.0'),
  fakePackage('test-runner', '3.0.0'),
  fakePackage('types', '0.5.2'),
])

const DEMO_PACKAGE_JSON = JSON.stringify({
  name: 'demo',
  dependencies: {
    [`@${FAKE_OWNER}/router`]: '^4.18.0',
    [`@${FAKE_OWNER}/dates`]: '^2.30.0',
    [`@${FAKE_OWNER}/colors`]: '^5.3.0',
    [`@${FAKE_OWNER}/tiny`]: '^1.0.0',
    'local-thing': 'file:../local-thing',
  },
  devDependencies: {
    [`@${FAKE_OWNER}/test-runner`]: '^1.6.0',
    [`@${FAKE_OWNER}/types`]: '^0.4.0',
  },
})

const SMALL_PACKAGE_JSON = JSON.stringify({
  name: 'small',
  dependencies: { [`@${FAKE_OWNER}/tiny`]: '^1.0.0' },
})

function repo(packageJson: string | null): FakeRepo {
  return { defaultBranch: 'main', files: packageJson === null ? {} : { 'package.json': packageJson } }
}

const SOURCE_HOST_DATA: FakeSourceHostData = {
  repos: {
    [`${FAKE_OWNER}/demo`]: repo(DEMO_PACKAGE_JSON),
    // Three more good repos, enough to reach the per-user project limit.
    [`${FAKE_OWNER}/second`]: repo(SMALL_PACKAGE_JSON),
    [`${FAKE_OWNER}/third`]: repo(SMALL_PACKAGE_JSON),
    [`${FAKE_OWNER}/fourth`]: repo(SMALL_PACKAGE_JSON),
    // Repos the add-project check refuses.
    [`${FAKE_OWNER}/no-manifest`]: repo(null),
    [`${FAKE_OWNER}/bad-json`]: repo('{ this is not json'),
  },
  changelogs: {
    [`${FAKE_OWNER}/router`]: [
      '## 5.1.0',
      '- Added `router.param()` shorthand.',
      '',
      '## 5.0.0',
      '- BREAKING: `app.del()` was removed. Use `app.delete()`.',
      '- BREAKING: `req.param(name)` was removed. Use `req.params`, `req.body` or `req.query`.',
      '',
      '## 4.18.0',
      '- Maintenance release.',
    ].join('\n'),
    [`${FAKE_OWNER}/types`]: ['## 0.5.0', '- Various improvements.'].join('\n'),
  },
  releases: {
    [`${FAKE_OWNER}/test-runner`]: [
      { tag: 'v3.0.0', name: 'v3.0.0', body: 'Faster watch mode. No changes to the public API.' },
      { tag: 'v2.0.0', name: 'v2.0.0', body: 'Internal rewrite. No changes to the public API.' },
    ],
  },
}

/** What the fake model "says", by package. Goes through the real verdict validator. */
const fakeWorldResponder: FakeJudgeResponder = (input, attempt) => {
  if (input.packageName === `@${FAKE_OWNER}/test-runner`) {
    return { label: 'safe', summary: 'No breaking changes are listed (fake judge).', changes: [] }
  }
  if (input.packageName === `@${FAKE_OWNER}/types`) {
    return { label: 'unclear', summary: 'The changelog is too vague to tell (fake judge).', changes: [] }
  }
  if (input.packageName === `@${FAKE_OWNER}/router`) {
    return {
      label: 'breaking',
      summary: 'Two request and routing helpers were removed in 5.0.0 (fake judge).',
      changes: [
        {
          title: 'app.del() removed',
          whatChanged: '`app.del()` no longer exists.',
          apiNames: ['app.del'],
          whatToDo: 'Call `app.delete()` instead.',
        },
        {
          title: 'req.param() removed',
          whatChanged: '`req.param(name)` no longer exists.',
          apiNames: ['req.param'],
          whatToDo: 'Read `req.params`, `req.body` or `req.query` directly.',
        },
      ],
    }
  }
  return defaultFakeResponder(input, attempt)
}

export interface FakeWorld {
  registry: PackageRegistry
  sourceHost: SourceHost
  judge: Judge
}

/** A fresh set of fakes over the fixed data above. */
export function buildFakeWorld(): FakeWorld {
  return {
    registry: new FakeRegistry(PACKAGES),
    sourceHost: new FakeSourceHost(SOURCE_HOST_DATA),
    judge: new FakeJudge(fakeWorldResponder),
  }
}
