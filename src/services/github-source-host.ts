/**
 * The real source host: GitHub.
 *
 * Repo metadata and file contents go through the platform's GitHub
 * integration, billed to the app owner (src/integrations.ts). Release notes
 * are the best-effort fallback (decision 4): one plain, unauthenticated
 * `fetch` to GitHub's public Releases API, which is free. If GitHub refuses
 * it (rate limit, network), the answer is "no release notes", and the
 * verdict becomes "no changelog found".
 *
 * The integration is injected as a function, so this file needs nothing from
 * the platform. The pure helpers that read the responses are unit-tested.
 * The class itself is never called by a test: only the supervisor's live
 * check and production reach GitHub.
 */

import { SCAN_PACING } from '../config'
import type { ReleaseNote } from '../core/changelog'
import type { RepoRef, SourceRepo } from '../core/model'
import type { ChangelogFile, ReleaseList, RepoInfo, SourceHost } from './types'

/** What an integration call answers. `ActionTools.integration` has this shape. */
export type IntegrationReply =
  | { success: true; data: unknown }
  | { success: false; error: string; status?: number; code?: string }

/** Calls one owner-billed integration endpoint, for example "github/get-repository". */
export type IntegrationCall = (endpoint: string, data: Record<string, unknown>) => Promise<IntegrationReply>

export class GitHubSourceHost implements SourceHost {
  constructor(private readonly callIntegration: IntegrationCall) {}

  async getRepo(repo: RepoRef): Promise<RepoInfo | null> {
    const reply = await this.callIntegration('github/get-repository', { owner: repo.owner, repo: repo.repo })
    if (!reply.success) {
      if (isNotFound(reply)) return null
      throw new Error(`GitHub could not be reached for ${repo.owner}/${repo.repo}: ${reply.error}`)
    }
    return readRepoInfo(reply.data)
  }

  async getFile(repo: RepoRef, path: string, ref: string): Promise<string | null> {
    return this.readFile(repo, path, ref)
  }

  async getChangelog(source: SourceRepo): Promise<ChangelogFile | null> {
    const path = source.directory ? `${source.directory}/CHANGELOG.md` : 'CHANGELOG.md'
    // No ref: the integration reads the default branch.
    const text = await this.readFile(source, path, undefined)
    if (text === null) return null
    return { text, url: `https://github.com/${source.owner}/${source.repo}/blob/HEAD/${path}` }
  }

  async getReleases(source: SourceRepo): Promise<ReleaseList | null> {
    let body: unknown
    try {
      const response = await fetch(releasesApiUrl(source), {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'bumpcheck' },
        signal: AbortSignal.timeout(SCAN_PACING.outboundTimeoutMs),
      })
      if (!response.ok) return null
      body = await response.json()
    } catch {
      // Best effort: a refused or failed request is "no release notes".
      return null
    }
    const releases = readReleases(body, source)
    if (releases.length === 0) return null
    return { releases, url: `https://github.com/${source.owner}/${source.repo}/releases` }
  }

  private async readFile(repo: RepoRef, path: string, ref: string | undefined): Promise<string | null> {
    const reply = await this.callIntegration('github/get-repository-contents', {
      owner: repo.owner,
      repo: repo.repo,
      path,
      ...(ref === undefined ? {} : { ref }),
    })
    if (!reply.success) {
      if (isNotFound(reply)) return null
      throw new Error(`GitHub could not read ${path} in ${repo.owner}/${repo.repo}: ${reply.error}`)
    }
    return readFileText(reply.data)
  }
}

// ----------------------------------------------------------- pure helpers

/** Is a failed integration call GitHub saying "no such repo or file"? */
export function isNotFound(reply: { error: string; status?: number; code?: string }): boolean {
  return reply.status === 404 || reply.code === 'not_found' || /not found|\b404\b/i.test(reply.error)
}

/**
 * Reads the default branch from repo metadata. Null when the repo is marked
 * private. Accepts GitHub's own field name (`default_branch`) and the
 * camelCase form.
 */
export function readRepoInfo(data: unknown): RepoInfo | null {
  if (!isObject(data)) throw new Error('GitHub sent unexpected repository data')
  if (data.private === true) return null
  const branch = data.default_branch ?? data.defaultBranch
  if (typeof branch !== 'string' || branch === '') throw new Error('GitHub sent repository data with no default branch')
  return { defaultBranch: branch }
}

/**
 * Reads a file's text from a contents response. GitHub sends
 * `{ type: "file", encoding: "base64", content: "..." }`; plain text is
 * accepted too. Null for a directory listing (the path is not a file).
 */
export function readFileText(data: unknown): string | null {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return null
  if (!isObject(data)) throw new Error('GitHub sent unexpected file data')
  if (data.type !== undefined && data.type !== 'file') return null
  if (typeof data.content !== 'string') throw new Error('GitHub sent file data with no content')
  return data.encoding === 'base64' ? decodeBase64Utf8(data.content) : data.content
}

/** `https://api.github.com/repos/<owner>/<repo>/releases?per_page=100`: the newest 100 releases. */
export function releasesApiUrl(source: SourceRepo): string {
  return `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/releases?per_page=100`
}

/**
 * Reads the Releases API's list into release notes.
 *
 * For a package in a monorepo subfolder, only tags in the `pkg@1.2.3` form
 * are kept. A plain `v1.2.3` tag in a monorepo does not say which package it
 * belongs to, and the changelog slicer can only tell packages apart in the
 * `pkg@1.2.3` form, so keeping it could hand the judge another package's
 * notes. Dropping it means "no changelog found" instead of a wrong verdict.
 */
export function readReleases(body: unknown, source: SourceRepo): ReleaseNote[] {
  if (!Array.isArray(body)) return []
  const releases: ReleaseNote[] = []
  for (const item of body) {
    if (!isObject(item) || typeof item.tag_name !== 'string') continue
    if (item.draft === true) continue
    if (source.directory !== undefined && !item.tag_name.includes('@')) continue
    releases.push({
      tag: item.tag_name,
      name: typeof item.name === 'string' ? item.name : null,
      body: typeof item.body === 'string' ? item.body : null,
    })
  }
  return releases
}

function decodeBase64Utf8(content: string): string {
  const binary = atob(content.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
