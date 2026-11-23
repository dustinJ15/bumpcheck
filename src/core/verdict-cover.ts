/**
 * Does a stored verdict cover a given project's upgrade?
 *
 * Verdicts are shared under a key of package, current major and target
 * major.minor (decision 3; `verdictKey` in ./verdict.ts). For a major upgrade
 * that sharing is the point: everyone going from express 4 to 5.1 reads the
 * same verdict, whatever 4.x they are on.
 *
 * For a minor or patch upgrade the key is the same for every project in that
 * major (`lodash@4->4.17`), but the changelog that matters is exactly the
 * range between the project's version and the target. A verdict read from
 * 4.17.1 says nothing about a project still on 4.2.0. So a minor or patch
 * verdict covers a dependency only when it was read from that dependency's
 * version or an earlier one, that is, when it read at least the same range.
 * (Decided by the supervisor, 2026-11-23, ticket 03; the key is unchanged.)
 *
 * When a verdict does not cover a dependency, the dependency is shown as
 * "not read", and a "check this one" for it reads the wider range and
 * replaces the stored verdict, which then covers both projects.
 *
 * Pure: no I/O, no platform imports.
 */

import semver from 'semver'
import type { DependencyResult, Verdict } from './model'

export function verdictCovers(
  verdict: Pick<Verdict, 'fromVersion'>,
  dependency: Pick<DependencyResult, 'triage' | 'current'>,
): boolean {
  if (dependency.triage === 'major') return true
  if (dependency.current === null) return false
  if (semver.valid(verdict.fromVersion) === null || semver.valid(dependency.current) === null) return false
  return semver.lte(verdict.fromVersion, dependency.current)
}
