/**
 * Reads a repo's root package.json and says, in a specific message, why it
 * cannot be scanned when it cannot (stories 6 and 7).
 *
 * Used twice, so both give the same answer in the same words: by the
 * add-project check before a project is created (./add-project.ts), and by
 * the scan engine at the start of every scan (./scan.ts), since a repo can
 * change after it was added.
 *
 * No platform imports: the source host is injected.
 */

import { LIMITS } from '../config'
import type { RepoRef } from '../core/model'
import { listDependencies, type DeclaredDependency } from '../core/triage'
import type { SourceHost } from '../services/types'

export type ManifestProblem = 'repo-not-found' | 'no-package-json' | 'invalid-json' | 'too-many-dependencies'

export type ManifestReading =
  | { ok: true; defaultBranch: string; declared: DeclaredDependency[] }
  | { ok: false; problem: ManifestProblem; message: string }

export async function readRepoManifest(sourceHost: SourceHost, repo: RepoRef): Promise<ManifestReading> {
  const info = await sourceHost.getRepo(repo)
  if (info === null) {
    return problem('repo-not-found', 'The repository was not found or is not public.')
  }

  const text = await sourceHost.getFile(repo, 'package.json', info.defaultBranch)
  if (text === null) {
    return problem('no-package-json', 'The repository has no package.json at its root.')
  }

  let manifest: unknown
  try {
    manifest = JSON.parse(text)
  } catch {
    return problem('invalid-json', 'package.json is not valid JSON.')
  }

  const declared = listDependencies(manifest)
  if (declared.length > LIMITS.dependenciesPerProject) {
    return problem(
      'too-many-dependencies',
      `package.json declares ${declared.length} dependencies; bumpcheck reads at most ${LIMITS.dependenciesPerProject}.`,
    )
  }

  return { ok: true, defaultBranch: info.defaultBranch, declared }
}

function problem(kind: ManifestProblem, message: string): ManifestReading {
  return { ok: false, problem: kind, message }
}
