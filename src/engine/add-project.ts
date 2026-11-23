/**
 * The add-project check: may this user add this repo as a project?
 *
 * Every refusal has its own message (stories 6 to 9). The free checks run
 * first (is the input a repo, is it a duplicate, is the user at their
 * limit), so a refused request never costs a GitHub call. Only then is the
 * repo itself read.
 *
 * The server action in src/actions/add-project.ts calls this, then creates
 * the project and enqueues its first scan. No platform imports here, so the
 * unit tests run it against the fake source host.
 */

import { LIMITS } from '../config'
import { mayAddProject } from '../core/limits'
import type { RepoRef } from '../core/model'
import { parseRepoInput } from '../core/repo-input'
import type { SourceHost } from '../services/types'
import { readRepoManifest, type ManifestProblem } from './manifest'

export type AddProjectRefusal = 'invalid-input' | 'duplicate' | 'project-limit' | ManifestProblem

export type NewProjectCheck =
  | { ok: true; repo: RepoRef; defaultBranch: string }
  | { ok: false; refusal: AddProjectRefusal; message: string }

export interface NewProjectRequest {
  /** What the user typed: `owner/repo` or a GitHub URL. */
  repoInput: unknown
  /** The app owner is exempt from the per-user project limit. */
  isAppOwner: boolean
  /** The repos this user already has as projects. */
  existing: RepoRef[]
}

export const PROJECT_LIMIT_MESSAGE = `You have reached the limit of ${LIMITS.projectsPerUser} projects. Delete one to add another.`

export function duplicateMessage(repo: RepoRef): string {
  return `You have already added ${repo.owner}/${repo.repo}.`
}

export async function checkNewProject(request: NewProjectRequest, sourceHost: SourceHost): Promise<NewProjectCheck> {
  const parsed = parseRepoInput(request.repoInput)
  if (!parsed.ok) return { ok: false, refusal: 'invalid-input', message: parsed.message }
  const repo = parsed.repo

  if (request.existing.some((other) => sameRepo(other, repo))) {
    return { ok: false, refusal: 'duplicate', message: duplicateMessage(repo) }
  }

  if (!mayAddProject({ projectCount: request.existing.length, isAppOwner: request.isAppOwner })) {
    return { ok: false, refusal: 'project-limit', message: PROJECT_LIMIT_MESSAGE }
  }

  const manifest = await readRepoManifest(sourceHost, repo)
  if (!manifest.ok) return { ok: false, refusal: manifest.problem, message: manifest.message }

  return { ok: true, repo, defaultBranch: manifest.defaultBranch }
}

/** GitHub names are case-insensitive. */
function sameRepo(a: RepoRef, b: RepoRef): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
}
