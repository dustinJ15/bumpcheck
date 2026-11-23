/**
 * Repo input: turn what a user typed into a GitHub owner and repo name.
 *
 * Accepts `owner/repo` and the usual GitHub URL forms (story 5). The result
 * is lowercased: GitHub names are case-insensitive, and the "same repo
 * already added" rule compares stored strings exactly, so `Foo/Bar` and
 * `foo/bar` must be stored the same way.
 *
 * Pure: no I/O, no platform imports.
 */

import type { RepoRef } from './model'

export const INVALID_REPO_INPUT_MESSAGE =
  'Enter a public GitHub repository as owner/repo or a github.com URL.'

export type RepoInputResult = { ok: true; repo: RepoRef } | { ok: false; message: string }

// GitHub's own rules: an owner is letters, digits and inner dashes, up
// to 39 characters; a repo name is letters, digits, dot, dash and underscore,
// up to 100.
const OWNER = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/
const REPO = /^[a-z0-9._-]{1,100}$/

export function parseRepoInput(input: unknown): RepoInputResult {
  if (typeof input !== 'string') return invalid()

  let text = input.trim()
  // "git@github.com:owner/repo.git"
  text = text.replace(/^git@github\.com:/i, '')
  // "https://github.com/owner/repo/...", with or without the scheme and "www."
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i.exec(text)
  const isUrl = url !== null
  if (isUrl) text = url[1].replace(/[?#].*$/, '')

  const parts = text.split('/').filter((part) => part !== '')
  // A URL may carry more path ("/tree/main/src"); plain input may not.
  if (parts.length < 2 || (!isUrl && parts.length > 2)) return invalid()
  // Plain "owner/repo" must not start with a slash ("/express").
  if (!isUrl && text.startsWith('/')) return invalid()

  const owner = parts[0].toLowerCase()
  const repo = parts[1].toLowerCase().replace(/\.git$/, '')
  if (!OWNER.test(owner)) return invalid()
  if (!REPO.test(repo) || repo === '.' || repo === '..') return invalid()

  return { ok: true, repo: { owner, repo } }
}

function invalid(): RepoInputResult {
  return { ok: false, message: INVALID_REPO_INPUT_MESSAGE }
}
