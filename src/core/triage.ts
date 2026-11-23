/**
 * Dependency triage: how far behind is each dependency?
 *
 * Pure semver arithmetic. This is what decides where AI money goes: only a
 * "major" result is read by the judge automatically (decision 2).
 *
 * Rules (spec, "Modules"):
 *   - Only `dependencies` and `devDependencies` are read.
 *   - The current version is the lowest version the declared range allows.
 *     The lockfile is not read.
 *   - The target is the registry's `latest` tag. Prereleases are ignored.
 *   - A `0.x` minor bump counts as major.
 *   - Git URLs, local paths, workspace links and unpublished packages are
 *     "not checked", never dropped.
 */

import semver from 'semver'
import type { DependencyGroup, DependencyResult, NotCheckedReason, TriageClass } from './model'

/** A dependency as declared in package.json, before anything is looked up. */
export interface DeclaredDependency {
  name: string
  group: DependencyGroup
  declared: string
}

/** What the package registry says about one package. */
export interface PublishedVersions {
  /** The registry's `latest` dist-tag. */
  latest: string | null
  /** Every published version, used only when `latest` is a prerelease. */
  versions: string[]
}

/**
 * Lists the dependencies a package.json declares: runtime first, then dev.
 * A package listed in both blocks is reported once, as runtime. Anything
 * that is not a plain object of strings is ignored.
 */
export function listDependencies(manifest: unknown): DeclaredDependency[] {
  if (!isObject(manifest)) return []
  const result: DeclaredDependency[] = []
  const seen = new Set<string>()
  const blocks: Array<[string, DependencyGroup]> = [
    ['dependencies', 'runtime'],
    ['devDependencies', 'dev'],
  ]
  for (const [field, group] of blocks) {
    const block = manifest[field]
    if (!isObject(block)) continue
    for (const [name, declared] of Object.entries(block)) {
      if (typeof declared !== 'string' || seen.has(name)) continue
      seen.add(name)
      result.push({ name, group, declared: declared.trim() })
    }
  }
  return result
}

/** The result of reading a declared spec, before the registry is asked. */
export type SpecReading =
  | { kind: 'range'; current: string }
  | { kind: 'not-checked'; reason: NotCheckedReason }

/** Reads a declared spec: either a semver range with its lowest version, or why it can't be checked. */
export function readSpec(declared: string): SpecReading {
  const spec = declared.trim()
  if (spec.startsWith('workspace:')) return notChecked('workspace')
  if (spec.startsWith('npm:')) return notChecked('alias')
  if (/^(file:|link:|\.{1,2}\/|\/|~\/)/.test(spec)) return notChecked('local')
  if (/^(git\+|git:|github:|gitlab:|bitbucket:|gist:)/.test(spec)) return notChecked('git')
  if (/^https?:\/\//.test(spec)) return notChecked('url')
  // GitHub shorthand: "user/repo" or "user/repo#ref".
  if (/^[\w.-]+\/[\w.-]+(#.*)?$/.test(spec)) return notChecked('git')

  const range = semver.validRange(spec)
  if (range === null) {
    // A bare word such as "latest" or "next" is a dist-tag, not a range.
    return /^[a-z][\w.-]*$/i.test(spec) ? notChecked('tag') : notChecked('invalid-range')
  }
  // "", "*" and "x" allow every version, so there is no meaningful current version.
  if (range === '*') return notChecked('unbounded')

  const lowest = semver.minVersion(spec)
  if (lowest === null) return notChecked('invalid-range')
  return { kind: 'range', current: lowest.version }
}

/** True when triage needs the registry's answer for this dependency. */
export function needsRegistryLookup(dep: DeclaredDependency): boolean {
  return readSpec(dep.declared).kind === 'range'
}

/**
 * The version to compare against: the `latest` tag when it is a stable
 * release, otherwise the highest stable published version. Null when there
 * is no stable release at all.
 */
export function pickTarget(info: PublishedVersions): string | null {
  const latest = info.latest === null ? null : semver.valid(info.latest)
  if (latest !== null && semver.prerelease(latest) === null) return latest
  // maxSatisfying with "*" skips prereleases.
  return semver.maxSatisfying(info.versions, '*')
}

/**
 * Compares the current version with the target by major, minor and patch.
 * Prerelease tags are ignored. A minor bump inside 0.x counts as major,
 * because semver treats 0.x minors as breaking.
 */
export function compareVersions(current: string, target: string): TriageClass {
  const c = semver.parse(current)
  const t = semver.parse(target)
  if (c === null || t === null) return 'not-checked'
  if (t.major !== c.major) return t.major > c.major ? 'major' : 'up-to-date'
  if (t.minor !== c.minor) {
    if (t.minor < c.minor) return 'up-to-date'
    return c.major === 0 ? 'major' : 'minor'
  }
  return t.patch > c.patch ? 'patch' : 'up-to-date'
}

/**
 * Triages one dependency. `info` is the registry's answer: null means the
 * registry does not know the package. It is ignored for specs that are not
 * checked anyway.
 */
export function triageDependency(dep: DeclaredDependency, info: PublishedVersions | null): DependencyResult {
  const base = { name: dep.name, group: dep.group, declared: dep.declared }
  const spec = readSpec(dep.declared)
  if (spec.kind === 'not-checked') return notCheckedResult(base, spec.reason)
  if (info === null) return notCheckedResult(base, 'unpublished')

  const target = pickTarget(info)
  if (target === null) return notCheckedResult(base, 'no-stable-release')

  return { ...base, current: spec.current, target, triage: compareVersions(spec.current, target) }
}

/**
 * Triages a whole package.json. `published` maps package name to the
 * registry's answer; a missing entry counts as unpublished.
 */
export function triage(
  manifest: unknown,
  published: Record<string, PublishedVersions | null>,
): DependencyResult[] {
  return listDependencies(manifest).map((dep) => triageDependency(dep, published[dep.name] ?? null))
}

function notChecked(reason: NotCheckedReason): SpecReading {
  return { kind: 'not-checked', reason }
}

function notCheckedResult(
  base: Pick<DependencyResult, 'name' | 'group' | 'declared'>,
  reason: NotCheckedReason,
): DependencyResult {
  return { ...base, current: null, target: null, triage: 'not-checked', notCheckedReason: reason }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
