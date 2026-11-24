/**
 * The add-project check: may this user add this repo as a project?
 *
 * Every refusal has its own message (stories 6 to 9). The free checks run
 * first (is the input a repo, is it a duplicate, is the user at their
 * limit), so a refused request never costs a GitHub call. Only then is the
 * repo itself read.
 *
 * Reading the repo costs the app owner one or two GitHub calls whatever the
 * answer, so the requests that get that far are counted as "attempts" and
 * capped per user per day. The attempt is counted before the GitHub call.
 *
 * The server action in src/actions/add-project.ts calls this, then creates
 * the project and enqueues its first scan. No platform imports here, so the
 * unit tests run it against the fake source host.
 */

import { LIMITS } from '../config'
import { mayAddProject, mayAttemptAddProject, waitUntilNextUtcDay } from '../core/limits'
import type { RepoRef } from '../core/model'
import { parseRepoInput } from '../core/repo-input'
import type { SourceHost } from '../services/types'
import { readRepoManifest, type ManifestProblem } from './manifest'

export type AddProjectRefusal = 'invalid-input' | 'duplicate' | 'project-limit' | 'attempt-limit' | ManifestProblem

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
  /** Epoch milliseconds. Used to say when the attempt limit resets. */
  now: number
}

/**
 * This user's add-project attempts for today (UTC). The server action backs
 * it with records (src/actions/add-project.ts); tests use a counter.
 */
export interface AddAttempts {
  /** Attempts already made today. */
  countToday(): Promise<number>
  /** Records one more attempt. Returns today's count, this one included. */
  record(): Promise<number>
}

export const PROJECT_LIMIT_MESSAGE = `You have reached the limit of ${LIMITS.projectsPerUser} projects. Delete one to add another.`

export function duplicateMessage(repo: RepoRef): string {
  return `You have already added ${repo.owner}/${repo.repo}.`
}

/** Says when the limit resets: daily counters are keyed by UTC day. */
export function attemptLimitMessage(now: number): string {
  return `You have tried to add a project ${LIMITS.addAttemptsPerUserPerDay} times today, which is the daily limit. You can try again after midnight UTC, in about ${waitUntilNextUtcDay(now)}.`
}

export async function checkNewProject(
  request: NewProjectRequest,
  sourceHost: SourceHost,
  attempts: AddAttempts,
): Promise<NewProjectCheck> {
  const parsed = parseRepoInput(request.repoInput)
  if (!parsed.ok) return { ok: false, refusal: 'invalid-input', message: parsed.message }
  const repo = parsed.repo

  if (request.existing.some((other) => sameRepo(other, repo))) {
    return { ok: false, refusal: 'duplicate', message: duplicateMessage(repo) }
  }

  if (!mayAddProject({ projectCount: request.existing.length, isAppOwner: request.isAppOwner })) {
    return { ok: false, refusal: 'project-limit', message: PROJECT_LIMIT_MESSAGE }
  }

  // From here on the request costs money, so it is an attempt. Refuse past
  // the cap; otherwise count it first, then call GitHub.
  const isAppOwner = request.isAppOwner
  const tooMany: NewProjectCheck = { ok: false, refusal: 'attempt-limit', message: attemptLimitMessage(request.now) }
  if (!mayAttemptAddProject({ attemptsToday: await attempts.countToday(), isAppOwner })) return tooMany
  // Counted again with this attempt in: requests sent at the same moment
  // each read the same count above, and only this second look stops them.
  const withThisOne = await attempts.record()
  if (!mayAttemptAddProject({ attemptsToday: withThisOne - 1, isAppOwner })) return tooMany

  const manifest = await readRepoManifest(sourceHost, repo)
  if (!manifest.ok) return { ok: false, refusal: manifest.problem, message: manifest.message }

  return { ok: true, repo, defaultBranch: manifest.defaultBranch }
}

/** GitHub names are case-insensitive. */
function sameRepo(a: RepoRef, b: RepoRef): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
}
