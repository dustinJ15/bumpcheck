/**
 * Changelog slicer: keep only the part of a changelog the judge must read.
 *
 * For an upgrade from `from` to `to`, the relevant sections are the versions
 * after `from` up to and including `to`. Everything else is dropped before
 * any AI sees it, and the result is cut at the input cap (spec, "Limits and
 * caps"), reporting that it did.
 *
 * Sections come out oldest first. A major's breaking notes live in its x.0.0
 * entry, so if the cap cuts anything it cuts the later, smaller releases.
 *
 * Pure: no I/O, no platform imports.
 */

import semver from 'semver'
import { JUDGE } from '../config'

/** An upgrade: versions after `from`, up to and including `to`. */
export interface VersionRange {
  from: string
  to: string
}

export interface SlicedChangelog {
  /** The in-range sections, joined, possibly cut at the cap. Empty when nothing matched. */
  text: string
  /** The versions that were kept, oldest first. */
  versions: string[]
  /** True when the text was cut at the cap. */
  truncated: boolean
}

/** One entry from a GitHub-style release list. */
export interface ReleaseNote {
  tag: string
  name?: string | null
  body?: string | null
}

interface Section {
  version: string
  text: string
}

/**
 * Slices a changelog file. Recognises version headings in the common styles:
 *
 *   ## 1.2.3            ## [1.2.3] - 2024-01-01     # v1.2.3
 *   ### 1.2.3 (date)    ## [1.2.3](compare-link)    ## Version 1.2.3
 *   ## pkg@1.2.3        ## <small>1.2.3</small>     1.2.3 / 2024-01-01
 *                                                   ==================
 *
 * A section runs from its version heading to the next version heading, or to
 * a non-version heading at the same or a higher level (for example
 * "## Unreleased"). Lines inside fenced code blocks are never headings.
 */
export function sliceChangelog(
  changelog: string,
  range: VersionRange,
  capChars: number = JUDGE.changelogInputCapChars,
): SlicedChangelog {
  const sections = findSections(changelog).filter((s) => inRange(s.version, range))
  return joinAndCut(sections, capChars)
}

/**
 * Slices a release list: selects the releases whose tag is in range and
 * concatenates their notes. When `packageName` is given, tags that name a
 * different package (monorepo style, `other@1.2.3`) are skipped.
 */
export function sliceReleases(
  releases: ReleaseNote[],
  range: VersionRange,
  packageName?: string,
  capChars: number = JUDGE.changelogInputCapChars,
): SlicedChangelog {
  const sections: Section[] = []
  for (const release of releases) {
    const version = releaseVersion(release, packageName)
    if (version === null || !inRange(version, range)) continue
    const title = release.name?.trim() || release.tag
    sections.push({ version, text: `## ${title}\n\n${(release.body ?? '').trim()}` })
  }
  return joinAndCut(sections, capChars)
}

/** Reads the version a heading names, or null if it is not a version heading. */
export function headingVersion(headingText: string): string | null {
  const text = headingText
    .replace(/<[^>]+>/g, '') // <small>, <a name="...">
    .replace(/^[\s[*_`]+/, '') // leading "[", bold, code
  const match = /^(?:(?:version|release|v)\s*)?(?:[@\w./-]+@)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?![\w.])/i.exec(text)
  if (match === null) return null
  return semver.valid(match[1])
}

function findSections(changelog: string): Section[] {
  const lines = changelog.replace(/\r\n?/g, '\n').split('\n')
  const sections: Section[] = []
  let current: { version: string; level: number; lines: string[] } | null = null
  let inFence = false

  const close = () => {
    if (current !== null) sections.push({ version: current.version, text: current.lines.join('\n').trim() })
    current = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const heading = inFence ? null : readHeading(line, lines[i + 1])

    if (heading !== null) {
      const version = headingVersion(heading.text)
      if (version !== null) {
        close()
        current = { version, level: heading.level, lines: [] }
      } else if (current !== null && heading.level <= current.level) {
        close()
      }
    }
    if (current !== null) current.lines.push(line)
  }
  close()
  return sections
}

/** An ATX heading ("## text") or a setext heading (text underlined with = or -). */
function readHeading(line: string, nextLine: string | undefined): { level: number; text: string } | null {
  const atx = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
  if (atx !== null) return { level: atx[1].length, text: atx[2] }
  // A list item, quote or table row followed by "---" is that block plus a
  // horizontal rule, not a heading (CommonMark), so it is never a candidate.
  const isBlockMarker = /^\s*([-*+>|]|\d+[.)])(\s|$)/.test(line)
  if (line.trim() !== '' && !isBlockMarker && nextLine !== undefined) {
    if (/^=+\s*$/.test(nextLine)) return { level: 1, text: line.trim() }
    if (/^-+\s*$/.test(nextLine)) return { level: 2, text: line.trim() }
  }
  return null
}

function releaseVersion(release: ReleaseNote, packageName: string | undefined): string | null {
  const tag = release.tag.trim()
  const at = tag.lastIndexOf('@')
  if (at > 0 && packageName !== undefined && tag.slice(0, at) !== packageName) return null
  const match = /v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag)
  return match === null ? null : semver.valid(match[1])
}

function inRange(version: string, range: VersionRange): boolean {
  return semver.gt(version, range.from) && semver.lte(version, range.to)
}

function joinAndCut(sections: Section[], capChars: number): SlicedChangelog {
  const ordered = [...sections].sort((a, b) => semver.compare(a.version, b.version))
  const full = ordered.map((s) => s.text).join('\n\n')
  const truncated = full.length > capChars
  return {
    text: truncated ? full.slice(0, capChars) : full,
    versions: ordered.map((s) => s.version),
    truncated,
  }
}
