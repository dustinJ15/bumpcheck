/**
 * The scan engine: one project, one scan, one step at a time.
 *
 * A scan is a list of steps. `runScanStep` runs exactly one and returns the
 * next state. The state is plain JSON, so a job can save it between steps
 * (`ctx.continue(state)`) and pick up on its next tick where it left off.
 *
 *   read-manifest  read the repo's package.json
 *   look-up        ask the registry for each dependency's versions, a batch per step
 *   attach-cached  triage, then attach verdicts already in the shared cache
 *   judge          one major upgrade per step: changelog -> slice -> judge,
 *                  within the per-scan cap and the daily AI ceiling, runtime first.
 *                  Every AI call in the app is made by this step, so every
 *                  path to the judge (first scan, daily scan, scan now,
 *                  check one, retry) passes the same two checks.
 *   write          write the results to the project row
 *   alert          hand off to the alert hook: the alert step in ./alert.ts
 *   done
 *
 * An on-demand scan ("check this one", or a retry of a failed verdict) is the
 * short version. It reads nothing from the repo and judges only what was
 * asked for:
 *
 *   read-request   read the package names the server action recorded on the
 *                  project row (`checkRequests`) and queue those for the judge
 *   judge          the same step as above, so the same two limits apply
 *   write          attach the new verdicts; the scan times are left alone
 *   done           (never alerts)
 *
 * Every outside call goes through the injected services, so this file has no
 * platform imports and runs unchanged in tests.
 *
 * Failures:
 *   - A problem with the repo itself (not found, no package.json, invalid
 *     JSON, too many dependencies) ends the scan as "failed" with a reason.
 *     Retrying would not help, so the engine records it and stops.
 *   - Anything unexpected (a service throws) propagates. The job decides
 *     whether to retry; when it gives up it calls `markScanFailed`.
 *   Either way the project's dependency list, and so its verdicts, is left
 *   as the last good scan wrote it (story 27), and the failed attempt counts
 *   as the project's scan for the day: `markScanFailed` moves its due time
 *   on, so the hourly task does not pick a failing project every hour.
 *
 * Signs of life: every write that starts a scan or reports progress also
 * stamps `scanHeartbeatAt`. The scheduled task uses it to find scans that
 * stopped without saying so (src/engine/schedule.ts).
 */

import { JUDGE, SCAN_PACING, VERDICT_SHAPE } from '../config'
import { sliceChangelog, sliceReleases, type SlicedChangelog } from '../core/changelog'
import { isDailyCeilingReached, mayJudgeAnother, nextDueTime, utcDay } from '../core/limits'
import type { DependencyResult, ProjectScanFields, ScanReport, SourceRepo, Verdict } from '../core/model'
import {
  needsRegistryLookup,
  pickTarget,
  triageDependency,
  type DeclaredDependency,
  type PublishedVersions,
} from '../core/triage'
import { verdictKey } from '../core/verdict'
import { verdictCovers } from '../core/verdict-cover'
import type { Clock, Judge, JudgeResult, PackageRegistry, RecordStore, SourceHost } from '../services/types'
import { readRepoManifest } from './manifest'

/** Called after a successful full scan's results are written. The real one is `alertHookFor` in ./alert.ts. */
export type AlertHook = (input: { projectId: string }) => Promise<void>

/** An alert hook that does nothing, for tests that are not about alerts. */
export const noAlerts: AlertHook = async () => {}

export interface ScanServices {
  registry: PackageRegistry
  sourceHost: SourceHost
  judge: Judge
  store: RecordStore
  clock: Clock
  alertHook: AlertHook
}

export type ScanStep =
  | 'read-request'
  | 'read-manifest'
  | 'look-up'
  | 'attach-cached'
  | 'judge'
  | 'write'
  | 'alert'
  | 'done'

/** Everything a scan needs to continue. Plain JSON: safe to save between job ticks. */
export interface ScanState {
  projectId: string
  /**
   * True for a "check this one" read or a retry: only the dependencies named
   * in the project's `checkRequests` are judged, and no alert is sent.
   */
  onDemand: boolean
  step: ScanStep
  /** How the scan ended, once `step` is "done". */
  outcome: 'succeeded' | 'failed' | null
  failureReason: string | null
  defaultBranch: string | null
  /** From package.json. */
  declared: DeclaredDependency[]
  /** Registry answers so far. Null means unpublished. */
  published: Record<string, PublishedVersions | null>
  sources: Record<string, SourceRepo | null>
  /** Filled by triage. */
  dependencies: DependencyResult[]
  /** Package names still waiting for a verdict, in judging order. */
  judgeQueue: string[]
  judgeTotal: number
  report: ScanReport
}

/** The state a new scan starts from. */
export function startScan(projectId: string, options: { onDemand?: boolean } = {}): ScanState {
  return {
    projectId,
    onDemand: options.onDemand ?? false,
    step: options.onDemand ? 'read-request' : 'read-manifest',
    outcome: null,
    failureReason: null,
    defaultBranch: null,
    declared: [],
    published: {},
    sources: {},
    dependencies: [],
    judgeQueue: [],
    judgeTotal: 0,
    report: { judged: 0, deferredByScanCap: 0, deferredByDailyCeiling: 0 },
  }
}

/** Runs one step and returns the next state. The input state is not changed. */
export async function runScanStep(services: ScanServices, state: ScanState): Promise<ScanState> {
  const next = structuredClone(state)
  switch (next.step) {
    case 'read-request':
      return readRequest(services, next)
    case 'read-manifest':
      return readManifest(services, next)
    case 'look-up':
      return lookUp(services, next)
    case 'attach-cached':
      return attachCached(services, next)
    case 'judge':
      return judgeNext(services, next)
    case 'write':
      return writeResults(services, next)
    case 'alert':
      return alert(services, next)
    case 'done':
      return next
  }
}

/** Runs steps until the scan is done (or `maxSteps` have run). Handy for tests and short scans. */
export async function runScan(
  services: ScanServices,
  state: ScanState,
  options: { maxSteps?: number } = {},
): Promise<ScanState> {
  let current = state
  let steps = 0
  while (current.step !== 'done' && steps < (options.maxSteps ?? Infinity)) {
    current = await runScanStep(services, current)
    steps++
  }
  return current
}

/** What recording a failure needs: somewhere to write it, and the time. */
export interface FailureRecorder {
  store: Pick<RecordStore, 'updateProject'>
  clock: Clock
}

/**
 * What a project row is set to when a scan or a check is queued for it.
 * Used by everything that enqueues: the server actions and the scheduled task.
 */
export function queuedFields(
  now: number,
): Pick<ProjectScanFields, 'scanStatus' | 'scanProgress' | 'scanError' | 'scanHeartbeatAt'> {
  return { scanStatus: 'queued', scanProgress: null, scanError: null, scanHeartbeatAt: iso(now) }
}

/**
 * Records a failed full scan on the project: status and reason, and any
 * on-demand request is dropped. The dependency list, and the verdicts it
 * points at, stay as they were, and so does `lastScanAt` (the last scan
 * that worked).
 *
 * The attempt is recorded by moving the due time on: the project is next
 * due after the normal re-scan interval, whatever the failure was.
 */
export async function markScanFailed(
  services: FailureRecorder,
  projectId: string,
  reason: string,
): Promise<void> {
  await services.store.updateProject(projectId, {
    scanStatus: 'failed',
    scanError: reason,
    scanProgress: null,
    nextDueAt: iso(nextDueTime(services.clock.now())),
    checkRequests: [],
  })
}

/**
 * Records an on-demand check that could not finish. The project's last full
 * scan still stands, so the project stays "done" with its results; only the
 * reason is recorded (the page shows it as "the last check failed") and the
 * request is dropped, so the user can ask again.
 */
export async function markCheckFailed(
  services: Pick<FailureRecorder, 'store'>,
  projectId: string,
  reason: string,
): Promise<void> {
  await services.store.updateProject(projectId, {
    scanStatus: 'done',
    scanError: reason,
    scanProgress: null,
    checkRequests: [],
  })
}

// ------------------------------------------------------------------ steps

/**
 * On-demand scans start here. The server action has already checked the
 * caller, the project and the request; this step reads the request from the
 * project row and decides which of the named dependencies need the judge.
 *
 * A dependency with a usable cached verdict is attached for free. One with
 * no verdict, a failed one (a retry), or one that was read from a later
 * version than the project is on, goes to the judge step, which
 * applies the per-scan cap and the daily ceiling exactly as a full scan does.
 */
async function readRequest(services: ScanServices, state: ScanState): Promise<ScanState> {
  const project = await services.store.getProject(state.projectId)
  if (project === null) return finish(state, 'failed', 'The project no longer exists.')

  await services.store.updateProject(state.projectId, {
    scanStatus: 'scanning',
    scanError: null,
    scanProgress: { step: 'read-request', message: 'Starting the check', done: 0, total: 1 },
    scanHeartbeatAt: iso(services.clock.now()),
  })

  // Start from the last scan's results: an on-demand scan changes only the
  // dependencies it was asked about.
  state.defaultBranch = project.defaultBranch
  state.dependencies = project.dependencies

  const requested = new Set(project.checkRequests)
  for (const dep of state.dependencies) {
    if (!requested.has(dep.name) || dep.current === null || dep.target === null) continue
    // Nothing to read for a dependency that is not behind.
    if (dep.triage !== 'major' && dep.triage !== 'minor' && dep.triage !== 'patch') continue
    delete dep.deferredBy
    const key = verdictKey(dep.name, dep.current, dep.target)
    const cached = await services.store.getVerdict(key)
    if (isSettled(cached, dep, true)) {
      dep.verdictKey = key
      continue
    }
    // The registry says where the package's changelog lives.
    const info = await services.registry.getPackage(dep.name)
    state.sources[dep.name] = info === null ? null : info.source
    state.judgeQueue.push(dep.name)
  }

  state.judgeTotal = state.judgeQueue.length
  state.step = state.judgeQueue.length > 0 ? 'judge' : 'write'
  return state
}

async function readManifest(services: ScanServices, state: ScanState): Promise<ScanState> {
  const project = await services.store.getProject(state.projectId)
  if (project === null) return finish(state, 'failed', 'The project no longer exists.')

  await services.store.updateProject(state.projectId, {
    scanStatus: 'scanning',
    scanError: null,
    scanProgress: { step: 'read-manifest', message: 'Reading package.json', done: 0, total: 1 },
    scanHeartbeatAt: iso(services.clock.now()),
  })

  const manifest = await readRepoManifest(services.sourceHost, { owner: project.repoOwner, repo: project.repoName })
  if (!manifest.ok) return fail(services, state, manifest.message)

  state.defaultBranch = manifest.defaultBranch
  state.declared = manifest.declared
  state.step = 'look-up'
  return state
}

async function lookUp(services: ScanServices, state: ScanState): Promise<ScanState> {
  const toLookUp = state.declared.filter(needsRegistryLookup)
  const batch = toLookUp.filter((dep) => !Object.hasOwn(state.published, dep.name)).slice(0, SCAN_PACING.registryLookupsPerStep)

  for (const dep of batch) {
    const info = await services.registry.getPackage(dep.name)
    if (info === null) {
      state.published[dep.name] = null
      state.sources[dep.name] = null
    } else {
      // Keep only what triage needs, so the saved state stays small:
      // the latest tag, plus the stable target when latest is a prerelease.
      const target = pickTarget(info)
      state.published[dep.name] = { latest: info.latest, versions: target === null ? [] : [target] }
      state.sources[dep.name] = info.source
    }
  }

  const done = toLookUp.filter((dep) => Object.hasOwn(state.published, dep.name)).length
  await progress(services, state, 'look-up', `Checking versions (${done} of ${toLookUp.length})`, done, toLookUp.length)
  if (done === toLookUp.length) state.step = 'attach-cached'
  return state
}

async function attachCached(services: ScanServices, state: ScanState): Promise<ScanState> {
  state.dependencies = state.declared.map((dep) => triageDependency(dep, ownValue(state.published, dep.name)))

  const needVerdict: DependencyResult[] = []
  for (const dep of state.dependencies) {
    if (dep.current === null || dep.target === null) continue
    if (dep.triage !== 'major' && dep.triage !== 'minor' && dep.triage !== 'patch') continue
    const key = verdictKey(dep.name, dep.current, dep.target)
    // Any stored verdict is attached, including one an on-demand check made
    // for a minor or patch upgrade. Only majors are judged automatically.
    // (src/core/verdict-cover.ts says when a stored verdict covers this dependency.)
    const cached = await services.store.getVerdict(key)
    if (isSettled(cached, dep, false)) dep.verdictKey = key
    else if (dep.triage === 'major') needVerdict.push(dep)
  }

  // Runtime dependencies first; package.json order within each group.
  state.judgeQueue = [
    ...needVerdict.filter((d) => d.group === 'runtime'),
    ...needVerdict.filter((d) => d.group === 'dev'),
  ].map((d) => d.name)
  state.judgeTotal = state.judgeQueue.length
  state.step = state.judgeQueue.length > 0 ? 'judge' : 'write'
  return state
}

async function judgeNext(services: ScanServices, state: ScanState): Promise<ScanState> {
  const name = state.judgeQueue[0]
  const dep = findDependency(state, name)
  const from = dep.current as string
  const to = dep.target as string
  const key = verdictKey(name, from, to)
  const source = ownValue(state.sources, name)

  // Look before paying. When this step runs a second time (a record write
  // failed after the judge answered, or the job restarted from an older
  // checkpoint), the verdict it produced the first time is already stored.
  const stored = await services.store.getVerdict(key)
  if (isSettled(stored, dep, state.onDemand)) {
    dep.verdictKey = key
    return nextInQueue(state)
  }

  // The two limits every AI call passes, whichever kind of scan this is.
  if (!mayJudgeAnother({ judgedThisScan: state.report.judged })) {
    return deferRest(state, 'scan-cap')
  }
  const day = utcDay(services.clock.now())
  if (isDailyCeilingReached({ aiCallsToday: await services.store.getAiCalls(day) })) {
    return deferRest(state, 'daily-ceiling')
  }

  await progress(
    services,
    state,
    'judge',
    `Reading the ${name} changelog`,
    state.judgeTotal - state.judgeQueue.length,
    state.judgeTotal,
  )

  const changelog = await findChangelog(services.sourceHost, source, name, { from, to })
  const base = { key, packageName: name, fromVersion: from, toVersion: to, changes: [] }

  if (changelog === 'refused') {
    // GitHub would not hand over the release notes. That says nothing about
    // the package, so nothing goes into the cache every project shares: the
    // dependency is left unread, marked with the reason, and the next scan
    // asks again. No AI call, and not counted against the per-scan cap.
    dep.deferredBy = 'source-refused'
    return nextInQueue(state)
  }

  if (changelog === null) {
    // No changelog text means no AI call (decision 5). Not counted against the per-scan cap.
    await services.store.putVerdict({
      ...base,
      status: 'no-changelog',
      sourceUrl: releasesPageUrl(source, name),
      inputTruncated: false,
      decidedAt: iso(services.clock.now()),
    })
    dep.verdictKey = key
    return nextInQueue(state)
  }

  const input = {
    packageName: name,
    fromVersion: from,
    toVersion: to,
    changelog: changelog.text,
    truncated: changelog.truncated,
  }

  let result: JudgeResult = { ok: false, error: 'not attempted' }
  let maxChanges: number = VERDICT_SHAPE.changesPerVerdict
  for (let attempt = 1; attempt <= JUDGE.attemptsPerVerdict; attempt++) {
    // The retry is an AI call too, so it is checked against the ceiling.
    if (attempt > 1 && isDailyCeilingReached({ aiCallsToday: await services.store.getAiCalls(day) })) {
      return deferRest(state, 'daily-ceiling')
    }
    await services.store.addAiCall(day)
    result = await askJudge(services.judge, { ...input, maxChanges })
    if (result.ok) break
    // The same request would be cut off again: ask for fewer changes.
    if (result.cutOff) maxChanges = VERDICT_SHAPE.shorterChangesPerVerdict
  }

  const verdict: Verdict = result.ok
    ? {
        ...base,
        status: 'ready',
        label: result.verdict.label,
        summary: result.verdict.summary,
        changes: result.verdict.changes,
        sourceUrl: changelog.url,
        inputTruncated: changelog.truncated,
        decidedAt: iso(services.clock.now()),
      }
    : {
        ...base,
        status: 'failed',
        failureReason: result.error,
        sourceUrl: changelog.url,
        inputTruncated: changelog.truncated,
        decidedAt: iso(services.clock.now()),
      }
  await services.store.putVerdict(verdict)

  dep.verdictKey = key
  state.report.judged++
  return nextInQueue(state)
}

/** The first dependency in the queue is dealt with: move to the next, or to writing the results. */
function nextInQueue(state: ScanState): ScanState {
  state.judgeQueue.shift()
  if (state.judgeQueue.length === 0) state.step = 'write'
  return state
}

/**
 * Is this stored verdict the answer for this dependency, so that the judge
 * need not be asked? It must cover the dependency (src/core/verdict-cover.ts).
 * A scan takes a verdict of any status, a failed one included: its attempts
 * were paid for, and trying again is the user's Retry button. An on-demand
 * read is that button (or "check this one"), so it does not settle for a
 * failed verdict.
 */
function isSettled(stored: Verdict | null, dep: DependencyResult, onDemand: boolean): stored is Verdict {
  if (stored === null || !verdictCovers(stored, dep)) return false
  return onDemand ? stored.status !== 'failed' : true
}

async function writeResults(services: ScanServices, state: ScanState): Promise<ScanState> {
  if (state.onDemand) {
    // Not a full scan: the last scan's time, due time and report stay as
    // they were. Only the dependency list (with the new verdict pointers)
    // changes, and the request is cleared.
    await services.store.updateProject(state.projectId, {
      dependencies: state.dependencies,
      scanStatus: 'done',
      scanProgress: null,
      scanError: null,
      checkRequests: [],
    })
    state.step = 'alert'
    return state
  }

  const now = services.clock.now()
  await services.store.updateProject(state.projectId, {
    defaultBranch: state.defaultBranch,
    dependencies: state.dependencies,
    scanStatus: 'done',
    scanProgress: null,
    scanReport: state.report,
    scanError: null,
    lastScanAt: iso(now),
    nextDueAt: iso(nextDueTime(now)),
    checkRequests: [],
  })
  state.step = 'alert'
  return state
}

async function alert(services: ScanServices, state: ScanState): Promise<ScanState> {
  if (!state.onDemand) await services.alertHook({ projectId: state.projectId })
  return finish(state, 'succeeded', null)
}

// ---------------------------------------------------------------- helpers

/**
 * CHANGELOG.md first, then GitHub releases. Null when neither has in-range
 * text. "refused" when the changelog file had nothing and GitHub would not
 * answer the request for release notes, so there may be text we did not see.
 */
async function findChangelog(
  sourceHost: SourceHost,
  source: SourceRepo | null,
  packageName: string,
  range: { from: string; to: string },
): Promise<(SlicedChangelog & { url: string }) | 'refused' | null> {
  if (source === null) return null

  const file = await sourceHost.getChangelog(source)
  if (file !== null) {
    const sliced = sliceChangelog(file.text, range)
    if (sliced.text !== '') return { ...sliced, url: file.url }
  }

  const list = await sourceHost.getReleases(source)
  if (list.status === 'refused') return 'refused'
  if (list.status === 'found') {
    const sliced = sliceReleases(list.releases, range, packageName)
    if (sliced.text !== '') return { ...sliced, url: list.url }
  }
  return null
}

/** A judge must not throw, but if one does, count it as a failed attempt. */
async function askJudge(judge: Judge, input: Parameters<Judge['judge']>[0]): Promise<JudgeResult> {
  try {
    return await judge.judge(input)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Leaves every remaining major for a later scan, marked with the limit that stopped it. */
function deferRest(state: ScanState, limit: 'scan-cap' | 'daily-ceiling'): ScanState {
  for (const name of state.judgeQueue) findDependency(state, name).deferredBy = limit
  if (limit === 'scan-cap') state.report.deferredByScanCap += state.judgeQueue.length
  else state.report.deferredByDailyCeiling += state.judgeQueue.length
  state.judgeQueue = []
  state.step = 'write'
  return state
}

async function fail(services: ScanServices, state: ScanState, reason: string): Promise<ScanState> {
  await markScanFailed(services, state.projectId, reason)
  return finish(state, 'failed', reason)
}

function finish(state: ScanState, outcome: 'succeeded' | 'failed', reason: string | null): ScanState {
  state.step = 'done'
  state.outcome = outcome
  state.failureReason = reason
  return state
}

async function progress(
  services: ScanServices,
  state: ScanState,
  step: ScanStep,
  message: string,
  done: number,
  total: number,
): Promise<void> {
  await services.store.updateProject(state.projectId, {
    scanProgress: { step, message, done, total },
    scanHeartbeatAt: iso(services.clock.now()),
  })
}

/**
 * Reads a by-name map without inherited properties: a package can be called
 * "constructor" or "toString", and those must not find Object's own.
 */
function ownValue<T>(map: Record<string, T | null>, name: string): T | null {
  return Object.hasOwn(map, name) ? map[name] : null
}

function findDependency(state: ScanState, name: string): DependencyResult {
  const dep = state.dependencies.find((d) => d.name === name)
  if (dep === undefined) throw new Error(`scan state has no dependency ${name}`)
  return dep
}

function releasesPageUrl(source: SourceRepo | null, packageName: string): string {
  return source === null
    ? `https://www.npmjs.com/package/${packageName}`
    : `https://github.com/${source.owner}/${source.repo}/releases`
}

function iso(time: number): string {
  return new Date(time).toISOString()
}
