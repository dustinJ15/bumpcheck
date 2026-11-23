/**
 * The real package registry: npm, over plain `fetch`. Free and public.
 *
 * One small request per package: `GET /<name>/latest` returns the manifest
 * of the version tagged `latest`, which has the version and the source repo.
 * The full package document (every version; megabytes for big packages) is
 * fetched only in the rare case that `latest` is a prerelease, because that
 * is the only time triage needs the other versions (to find the highest
 * stable one).
 *
 * The pure helpers (`npmLatestUrl`, `parseRepositoryField`) are unit-tested.
 * The class itself is never called by a test: only the supervisor's live
 * check and production reach npm.
 */

import semver from 'semver'
import { SCAN_PACING } from '../config'
import type { SourceRepo } from '../core/model'
import type { PackageRegistry, RegistryPackage } from './types'

const REGISTRY = 'https://registry.npmjs.org'

export class NpmRegistry implements PackageRegistry {
  async getPackage(name: string): Promise<RegistryPackage | null> {
    const latest = await getJson(npmLatestUrl(name))
    if (latest === null) return null

    const version = typeof latest.version === 'string' ? latest.version : null
    const source = parseRepositoryField(latest.repository)
    if (version === null) return { latest: null, versions: [], source }

    // A stable `latest` is the target; no other version matters.
    if (semver.prerelease(version) === null) return { latest: version, versions: [version], source }

    // `latest` is a prerelease: triage needs the stable versions too.
    const document = await getJson(npmDocumentUrl(name), 'application/vnd.npm.install-v1+json')
    const versions = document !== null && isObject(document.versions) ? Object.keys(document.versions) : [version]
    return { latest: version, versions, source }
  }
}

/** `https://registry.npmjs.org/@scope%2Fname/latest` */
export function npmLatestUrl(name: string): string {
  return `${npmDocumentUrl(name)}/latest`
}

export function npmDocumentUrl(name: string): string {
  // A scoped name keeps its "@"; its "/" must be encoded.
  return `${REGISTRY}/${encodeURIComponent(name).replace(/^%40/, '@')}`
}

/**
 * Reads the GitHub repo out of a manifest's `repository` field. npm allows a
 * string or an object, and several URL spellings:
 *
 *   "expressjs/express"                       "github:expressjs/express"
 *   "https://github.com/expressjs/express"    "git+https://github.com/o/r.git"
 *   "git://github.com/o/r.git"                "git@github.com:o/r.git"
 *   { "type": "git", "url": "...", "directory": "packages/core" }
 *
 * Null when there is no repository or it is not on GitHub.
 */
export function parseRepositoryField(repository: unknown): SourceRepo | null {
  const url = typeof repository === 'string' ? repository : isObject(repository) ? repository.url : null
  if (typeof url !== 'string') return null

  const text = url.trim()
  const match =
    /github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i.exec(text) ?? // any github.com URL
    /^github:([^/\s]+)\/([^/\s#?]+)$/i.exec(text) ?? // "github:owner/repo"
    /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(text) // bare "owner/repo" means GitHub
  if (match === null) return null

  const source: SourceRepo = { owner: match[1], repo: match[2].replace(/\.git$/i, '') }
  const directory = isObject(repository) ? repository.directory : null
  if (typeof directory === 'string') {
    const clean = directory.trim().replace(/^\.?\/+/, '').replace(/\/+$/, '')
    // A path that climbs out of the repo is not a folder in it.
    if (clean !== '' && !clean.split('/').includes('..')) source.directory = clean
  }
  return source
}

/** GET a JSON object. Null on 404 (the package is not published). Throws on any other failure. */
async function getJson(url: string, accept = 'application/json'): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, {
    headers: { Accept: accept },
    signal: AbortSignal.timeout(SCAN_PACING.outboundTimeoutMs),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`npm registry answered ${response.status} for ${url}`)
  const body: unknown = await response.json()
  if (!isObject(body)) throw new Error(`npm registry sent an unexpected body for ${url}`)
  return body
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
