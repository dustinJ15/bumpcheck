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
 * `bumpcheck-fake/demo` has one dependency for each state the project page
 * can show:
 *
 *   @bumpcheck-fake/router       major, changelog file   -> breaking verdict
 *   @bumpcheck-fake/big          major, long changelog   -> breaking, changelog cut at the cap
 *   @bumpcheck-fake/dates        major, no changelog     -> "no changelog found"
 *   @bumpcheck-fake/colors       minor                   -> not read; safe when checked on request
 *   @bumpcheck-fake/tiny         up to date
 *   local-thing                  a file: path            -> not checked
 *   @bumpcheck-fake/test-runner  dev, major, releases    -> safe verdict
 *   @bumpcheck-fake/types        dev, 0.x minor          -> unclear verdict
 *   @bumpcheck-fake/garbled      dev, major              -> failed verdict (the judge never makes sense)
 *   @bumpcheck-fake/lint         dev, patch              -> not read
 *
 * `bumpcheck-fake/slow` has three majors whose fake judge takes a moment to
 * answer, so a browser test can watch a scan in progress. `colors` is slow
 * too, so a "check this one" can be watched. `bumpcheck-fake/empty` declares
 * no dependencies at all. `bumpcheck-fake/older` is on an older `colors` than
 * the demo repo. `bumpcheck-fake/offline` has one minor upgrade whose
 * changelog the fake GitHub refuses to serve, so a check of it cannot finish.
 *
 * Three repos reach the limit and failure notices (ticket 04):
 *
 *   bumpcheck-fake/many         more majors than one scan may read, so a scan stops at its limit
 *   bumpcheck-fake/outage       a major whose changelog cannot be fetched, so the scan fails
 *   bumpcheck-fake/ratelimited  a major whose release notes GitHub refuses, so it is not read
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
import { LIMITS } from '../config'
import type { Judge, PackageRegistry, RegistryPackage, SourceHost } from './types'

export const FAKE_OWNER = 'bumpcheck-fake'

function fakePackage(name: string, latest: string, hasSource = true): [string, RegistryPackage] {
  return [
    `@${FAKE_OWNER}/${name}`,
    { latest, versions: [latest], source: hasSource ? { owner: FAKE_OWNER, repo: name } : null },
  ]
}

/** Two more majors than one scan may read: `many-01` to `many-17`. */
const MANY_NAMES = Array.from({ length: LIMITS.newVerdictsPerScan + 2 }, (_, i) => `many-${String(i + 1).padStart(2, '0')}`)

const PACKAGES: Record<string, RegistryPackage> = Object.fromEntries([
  fakePackage('router', '5.1.0'),
  fakePackage('dates', '4.1.0'),
  fakePackage('colors', '5.4.1'),
  fakePackage('tiny', '1.0.0'),
  fakePackage('test-runner', '3.0.0'),
  fakePackage('types', '0.5.2'),
  fakePackage('big', '9.0.0'),
  fakePackage('garbled', '2.0.0'),
  fakePackage('lint', '1.2.3'),
  fakePackage('slow-a', '2.0.0'),
  fakePackage('slow-b', '3.0.0'),
  fakePackage('slow-c', '4.0.0'),
  fakePackage('unreachable', '1.1.0'),
  fakePackage('outage', '2.0.0'),
  fakePackage('limited', '2.0.0'),
  ...MANY_NAMES.map((name) => fakePackage(name, '2.0.0')),
])

/** Every package the fake registry knows. The test reset clears their verdicts by name. */
export const FAKE_PACKAGE_NAMES: readonly string[] = Object.keys(PACKAGES)

/**
 * How long the fake judge waits before answering, by package. Long enough
 * for a browser test to see the scan's progress on the page.
 */
export const FAKE_JUDGE_DELAY_MS: Readonly<Record<string, number>> = {
  [`@${FAKE_OWNER}/slow-a`]: 1500,
  [`@${FAKE_OWNER}/slow-b`]: 1500,
  [`@${FAKE_OWNER}/slow-c`]: 1500,
  [`@${FAKE_OWNER}/colors`]: 2000,
}

const DEMO_PACKAGE_JSON = JSON.stringify({
  name: 'demo',
  dependencies: {
    [`@${FAKE_OWNER}/router`]: '^4.18.0',
    [`@${FAKE_OWNER}/big`]: '^8.0.0',
    [`@${FAKE_OWNER}/dates`]: '^2.30.0',
    [`@${FAKE_OWNER}/colors`]: '^5.3.0',
    [`@${FAKE_OWNER}/tiny`]: '^1.0.0',
    'local-thing': 'file:../local-thing',
  },
  devDependencies: {
    [`@${FAKE_OWNER}/test-runner`]: '^1.6.0',
    [`@${FAKE_OWNER}/types`]: '^0.4.0',
    [`@${FAKE_OWNER}/garbled`]: '^1.0.0',
    [`@${FAKE_OWNER}/lint`]: '^1.2.0',
  },
})

const SLOW_PACKAGE_JSON = JSON.stringify({
  name: 'slow',
  dependencies: {
    [`@${FAKE_OWNER}/slow-a`]: '^1.0.0',
    [`@${FAKE_OWNER}/slow-b`]: '^2.0.0',
    [`@${FAKE_OWNER}/slow-c`]: '^3.0.0',
  },
})

/** A changelog well past the judge's input cap, so the slicer has to cut it. */
const BIG_CHANGELOG = [
  '## 9.0.0',
  '- BREAKING: `open(path)` now returns a promise.',
  ...Array.from({ length: 1200 }, (_, i) => `- Internal change number ${i + 1}, of no interest to anyone.`),
].join('\n')

const SMALL_PACKAGE_JSON = JSON.stringify({
  name: 'small',
  dependencies: { [`@${FAKE_OWNER}/tiny`]: '^1.0.0' },
})

/** A repo whose only dependencies are the given fake packages, each a major behind. */
function repoBehindOn(name: string, packages: string[]): FakeRepo {
  return repo(JSON.stringify({ name, dependencies: Object.fromEntries(packages.map((p) => [`@${FAKE_OWNER}/${p}`, '^1.0.0'])) }))
}

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
    [`${FAKE_OWNER}/slow`]: repo(SLOW_PACKAGE_JSON),
    [`${FAKE_OWNER}/empty`]: repo(JSON.stringify({ name: 'empty' })),
    [`${FAKE_OWNER}/older`]: repo(JSON.stringify({ name: 'older', dependencies: { [`@${FAKE_OWNER}/colors`]: '^5.1.0' } })),
    [`${FAKE_OWNER}/offline`]: repo(
      JSON.stringify({ name: 'offline', dependencies: { [`@${FAKE_OWNER}/unreachable`]: '^1.0.0' } }),
    ),
    [`${FAKE_OWNER}/many`]: repoBehindOn('many', MANY_NAMES),
    [`${FAKE_OWNER}/outage`]: repoBehindOn('outage', ['outage']),
    [`${FAKE_OWNER}/ratelimited`]: repoBehindOn('ratelimited', ['limited']),
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
    [`${FAKE_OWNER}/big`]: BIG_CHANGELOG,
    [`${FAKE_OWNER}/garbled`]: ['## 2.0.0', '- Rewritten.'].join('\n'),
    [`${FAKE_OWNER}/colors`]: [
      '## 5.4.1',
      '- Fixed a typo.',
      '',
      '## 5.4.0',
      '- Added `colors.dim()`.',
      '',
      '## 5.3.0',
      '- Added `colors.bold()`.',
      '',
      '## 5.2.0',
      '- Added `colors.italic()`.',
    ].join('\n'),
    [`${FAKE_OWNER}/lint`]: ['## 1.2.3', '- Fixed a false positive.'].join('\n'),
    [`${FAKE_OWNER}/slow-a`]: ['## 2.0.0', '- BREAKING: renamed the main export.'].join('\n'),
    [`${FAKE_OWNER}/slow-b`]: ['## 3.0.0', '- BREAKING: renamed the main export.'].join('\n'),
    [`${FAKE_OWNER}/slow-c`]: ['## 4.0.0', '- BREAKING: renamed the main export.'].join('\n'),
    ...Object.fromEntries(
      MANY_NAMES.map((name) => [`${FAKE_OWNER}/${name}`, ['## 2.0.0', '- BREAKING: renamed the main export.'].join('\n')]),
    ),
  },
  releases: {
    [`${FAKE_OWNER}/test-runner`]: [
      { tag: 'v3.0.0', name: 'v3.0.0', body: 'Faster watch mode. No changes to the public API.' },
      { tag: 'v2.0.0', name: 'v2.0.0', body: 'Internal rewrite. No changes to the public API.' },
    ],
  },
  // No CHANGELOG.md, and the fake GitHub will not hand over its release notes.
  refusedReleases: [`${FAKE_OWNER}/limited`],
}

/** What the fake model "says", by package. Goes through the real verdict validator. */
const fakeWorldResponder: FakeJudgeResponder = (input, attempt) => {
  if (input.packageName === `@${FAKE_OWNER}/test-runner`) {
    return { label: 'safe', summary: 'No breaking changes are listed (fake judge).', changes: [] }
  }
  if (input.packageName === `@${FAKE_OWNER}/colors` || input.packageName === `@${FAKE_OWNER}/lint`) {
    return { label: 'safe', summary: 'Only additions and fixes are listed (fake judge).', changes: [] }
  }
  if (input.packageName === `@${FAKE_OWNER}/garbled`) {
    // Not a verdict, on every attempt: the engine stores a failed verdict.
    return 'I am sorry, I cannot help with that.'
  }
  if (input.packageName === `@${FAKE_OWNER}/big`) {
    return {
      label: 'breaking',
      summary: 'open() became asynchronous in 9.0.0 (fake judge).',
      changes: [
        {
          title: 'open() returns a promise',
          whatChanged: '`open(path)` used to return the handle directly.',
          apiNames: ['open'],
          whatToDo: 'Await the result of `open()`.',
        },
      ],
    }
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

/** The source repos of the fake packages whose changelog cannot be fetched: the request fails. */
const UNREACHABLE_REPOS = ['unreachable', 'outage']

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * A fresh set of fakes over the fixed data above. `sleep` is how the slow
 * packages wait; unit tests pass one that returns at once.
 */
export function buildFakeWorld(options: { sleep?: (ms: number) => Promise<void> } = {}): FakeWorld {
  const sleep = options.sleep ?? realSleep
  const judge = new FakeJudge(fakeWorldResponder)
  const sourceHost = new FakeSourceHost(SOURCE_HOST_DATA)
  return {
    registry: new FakeRegistry(PACKAGES),
    sourceHost: {
      getRepo: (repo) => sourceHost.getRepo(repo),
      getFile: (repo, path, ref) => sourceHost.getFile(repo, path, ref),
      getChangelog: async (source) => {
        if (UNREACHABLE_REPOS.includes(source.repo)) throw new Error('GitHub answered 503 (fake)')
        return sourceHost.getChangelog(source)
      },
      getReleases: (source) => sourceHost.getReleases(source),
    },
    judge: {
      judge: async (input) => {
        const delay = FAKE_JUDGE_DELAY_MS[input.packageName] ?? 0
        if (delay > 0) await sleep(delay)
        return judge.judge(input)
      },
    },
  }
}
