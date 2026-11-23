import { describe, expect, it } from 'vitest'
import { VERDICT_SHAPE } from '../config'
import { buildVerdictPrompt, validateVerdictResponse, verdictKey } from './verdict'

const good = {
  label: 'breaking',
  summary: 'Express 5 removes several deprecated methods.',
  changes: [
    {
      title: 'app.del() removed',
      whatChanged: 'app.del() was removed in favour of app.delete().',
      apiNames: ['app.del'],
      whatToDo: 'Replace app.del( with app.delete(.',
    },
  ],
}

describe('verdictKey: package, current major, target major.minor', () => {
  it('builds the shared cache key', () => {
    expect(verdictKey('express', '4.17.1', '5.1.0')).toBe('express@4->5.1')
    expect(verdictKey('@scope/pkg', '0.4.0', '0.5.2')).toBe('@scope/pkg@0->0.5')
  })

  it('is the same for patch-level differences on either side', () => {
    expect(verdictKey('express', '4.0.0', '5.1.0')).toBe(verdictKey('express', '4.21.2', '5.1.9'))
  })

  it('changes when the target minor changes', () => {
    expect(verdictKey('express', '4.17.1', '5.1.0')).not.toBe(verdictKey('express', '4.17.1', '5.2.0'))
  })

  it('refuses something that is not a version', () => {
    expect(() => verdictKey('x', 'latest', '1.0.0')).toThrow()
  })
})

describe('validateVerdictResponse: accepts good responses', () => {
  it('accepts a well-formed object', () => {
    expect(validateVerdictResponse(good)).toEqual({ ok: true, verdict: good })
  })

  it('accepts JSON text, with or without a ```json fence', () => {
    expect(validateVerdictResponse(JSON.stringify(good))).toEqual({ ok: true, verdict: good })
    expect(validateVerdictResponse('```json\n' + JSON.stringify(good, null, 2) + '\n```')).toEqual({
      ok: true,
      verdict: good,
    })
  })

  it('accepts JSON with text around it', () => {
    const wrapped = 'Here is the verdict:\n```json\n' + JSON.stringify(good) + '\n```\nHope that helps.'
    expect(validateVerdictResponse(wrapped)).toEqual({ ok: true, verdict: good })
    expect(validateVerdictResponse('Verdict: ' + JSON.stringify(good))).toEqual({ ok: true, verdict: good })
  })

  it('accepts safe and unclear verdicts with no changes', () => {
    expect(validateVerdictResponse({ label: 'safe', summary: 'Only new features.', changes: [] }).ok).toBe(true)
    expect(validateVerdictResponse({ label: 'unclear', summary: 'Notes are vague.', changes: [] }).ok).toBe(true)
  })

  it('drops a confidence score instead of storing it', () => {
    const result = validateVerdictResponse({ ...good, confidence: 0.9 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.verdict).not.toHaveProperty('confidence')
  })
})

describe('validateVerdictResponse: rejects malformed responses', () => {
  it.each([
    ['text that is not JSON', 'I think this is breaking.'],
    ['an unknown label', { ...good, label: 'maybe' }],
    ['a missing summary', { label: 'safe', changes: [] }],
    ['an empty summary', { ...good, summary: '   ' }],
    ['changes that are not a list', { ...good, changes: 'lots' }],
    ['a change missing whatToDo', { ...good, changes: [{ title: 't', whatChanged: 'w', apiNames: [] }] }],
    ['apiNames that are not strings', { ...good, changes: [{ ...good.changes[0], apiNames: [1, 2] }] }],
    ['a breaking verdict with no changes', { ...good, changes: [] }],
    ['null', null],
    ['an array', [good]],
    ['a summary over the size limit', { ...good, summary: 'x'.repeat(VERDICT_SHAPE.summaryChars + 1) }],
    ['too many changes', { ...good, changes: Array(VERDICT_SHAPE.changesPerVerdict + 1).fill(good.changes[0]) }],
  ])('rejects %s', (_name, response) => {
    const result = validateVerdictResponse(response)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/\S/)
  })
})

describe('buildVerdictPrompt', () => {
  const input = {
    packageName: 'express',
    fromVersion: '4.17.1',
    toVersion: '5.1.0',
    changelog: '## 5.0.0\n- removed app.del()',
    truncated: false,
  }

  it('names the package and versions and carries the changelog', () => {
    const { system, prompt } = buildVerdictPrompt(input)
    expect(prompt).toContain('express')
    expect(prompt).toContain('4.17.1 -> 5.1.0')
    expect(prompt).toContain('removed app.del()')
    expect(system).toContain('"label"')
  })

  it('asks for no confidence score', () => {
    expect(buildVerdictPrompt(input).system).toMatch(/do not add a confidence score/i)
  })

  it('tells the judge when the changelog was cut', () => {
    expect(buildVerdictPrompt({ ...input, truncated: true }).prompt).toMatch(/cut at a length limit/)
    expect(buildVerdictPrompt(input).prompt).not.toMatch(/cut at a length limit/)
  })
})
