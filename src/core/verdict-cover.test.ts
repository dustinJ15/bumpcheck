import { describe, expect, it } from 'vitest'
import { verdictCovers } from './verdict-cover'

describe('verdictCovers', () => {
  const read = (fromVersion: string) => ({ fromVersion })

  it('a minor upgrade is covered by a verdict read from its own version', () => {
    expect(verdictCovers(read('4.2.0'), { triage: 'minor', current: '4.2.0' })).toBe(true)
  })

  it('a minor upgrade is covered by a verdict read from an earlier version (a wider range)', () => {
    expect(verdictCovers(read('4.1.9'), { triage: 'minor', current: '4.2.0' })).toBe(true)
    expect(verdictCovers(read('4.0.0'), { triage: 'minor', current: '4.2.0' })).toBe(true)
  })

  it('a minor upgrade is not covered by a verdict read from a later version (a narrower range)', () => {
    expect(verdictCovers(read('4.2.1'), { triage: 'minor', current: '4.2.0' })).toBe(false)
    expect(verdictCovers(read('4.17.1'), { triage: 'minor', current: '4.2.0' })).toBe(false)
  })

  it('applies the same rule to a patch upgrade', () => {
    expect(verdictCovers(read('4.17.1'), { triage: 'patch', current: '4.17.1' })).toBe(true)
    expect(verdictCovers(read('4.17.0'), { triage: 'patch', current: '4.17.1' })).toBe(true)
    expect(verdictCovers(read('4.17.2'), { triage: 'patch', current: '4.17.1' })).toBe(false)
  })

  it('a major upgrade shares its verdict whatever version it was read from (decision 3)', () => {
    expect(verdictCovers(read('4.18.0'), { triage: 'major', current: '4.2.0' })).toBe(true)
    expect(verdictCovers(read('4.0.0'), { triage: 'major', current: '4.2.0' })).toBe(true)
  })

  it('covers nothing when a version cannot be compared', () => {
    expect(verdictCovers(read('not-a-version'), { triage: 'minor', current: '4.2.0' })).toBe(false)
    expect(verdictCovers(read('4.2.0'), { triage: 'minor', current: null })).toBe(false)
  })
})
