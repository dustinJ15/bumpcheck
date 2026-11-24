import { describe, expect, it } from 'vitest'
import { JUDGE, VERDICT_SHAPE } from '../config'
import { buildVerdictPrompt, CUT_OFF_ERROR, readJudgeAnswer, validateVerdictResponse, verdictKey } from './verdict'

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

describe('verdictKey: package, current major (0.minor for 0.x), target major.minor', () => {
  it('builds the shared cache key', () => {
    expect(verdictKey('express', '4.17.1', '5.1.0')).toBe('express@4->5.1')
    expect(verdictKey('@scope/pkg', '0.4.0', '0.5.2')).toBe('@scope/pkg@0.4->0.5')
  })

  it('gives two 0.x currents with different minors different keys', () => {
    expect(verdictKey('pkg', '0.1.0', '0.5.0')).toBe('pkg@0.1->0.5')
    expect(verdictKey('pkg', '0.4.0', '0.5.0')).toBe('pkg@0.4->0.5')
    expect(verdictKey('pkg', '0.1.0', '0.5.0')).not.toBe(verdictKey('pkg', '0.4.0', '0.5.0'))
    // Also when a 0.x package goes to 1.x.
    expect(verdictKey('pkg', '0.1.0', '1.0.0')).not.toBe(verdictKey('pkg', '0.4.0', '1.0.0'))
  })

  it('gives two patch versions of the same 0.x minor the same key', () => {
    expect(verdictKey('pkg', '0.4.0', '0.5.0')).toBe(verdictKey('pkg', '0.4.9', '0.5.3'))
  })

  it('is unchanged for a current major of 1 and up: the current minor is not in the key', () => {
    expect(verdictKey('pkg', '1.0.0', '2.3.0')).toBe('pkg@1->2.3')
    expect(verdictKey('pkg', '1.9.4', '2.3.0')).toBe('pkg@1->2.3')
    expect(verdictKey('pkg', '12.1.0', '13.0.1')).toBe('pkg@12->13.0')
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
    maxChanges: VERDICT_SHAPE.changesPerVerdict,
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

/** The biggest answer the validator accepts: every list full, every field at its length limit. */
function answerAtTheBounds() {
  const change = {
    title: 't'.repeat(VERDICT_SHAPE.titleChars),
    whatChanged: 'w'.repeat(VERDICT_SHAPE.noteChars),
    apiNames: Array(VERDICT_SHAPE.apiNamesPerChange).fill('a'.repeat(VERDICT_SHAPE.apiNameChars)),
    whatToDo: 'd'.repeat(VERDICT_SHAPE.noteChars),
  }
  return {
    label: 'breaking',
    summary: 's'.repeat(VERDICT_SHAPE.summaryChars),
    changes: Array(VERDICT_SHAPE.changesPerVerdict).fill(change),
  }
}

describe('the size bounds: prompt, validator and output cap agree', () => {
  const input = {
    packageName: 'express',
    fromVersion: '4.17.1',
    toVersion: '5.1.0',
    changelog: '## 5.0.0\n- removed app.del()',
    truncated: false,
    maxChanges: VERDICT_SHAPE.changesPerVerdict,
  }

  /** A character limit as the prompt states it: a share of the validator's limit, for headroom. */
  const asked = (validatorLimit: number) => Math.floor(validatorLimit * JUDGE.promptShare)

  it('the prompt states every bound from config, the character limits reduced by JUDGE.promptShare', () => {
    expect(JUDGE.promptShare).toBeGreaterThan(0)
    expect(JUDGE.promptShare).toBeLessThan(1)
    const { system } = buildVerdictPrompt(input)
    // The count of changes is the validator's own: the two must agree.
    expect(system).toContain(`at most ${VERDICT_SHAPE.changesPerVerdict} changes, the most important first`)
    expect(system).toContain(`"summary": at most ${asked(VERDICT_SHAPE.summaryChars)} characters`)
    expect(system).toContain(`"title": at most ${asked(VERDICT_SHAPE.titleChars)} characters`)
    expect(system).toContain(`"whatChanged" and "whatToDo": at most ${asked(VERDICT_SHAPE.noteChars)} characters each`)
    expect(system).toContain(
      `"apiNames": at most ${VERDICT_SHAPE.apiNamesPerChange} names of at most ${asked(VERDICT_SHAPE.apiNameChars)} characters each`,
    )
    // The validator's own character limits are not what the model is told.
    expect(system).not.toContain(`at most ${VERDICT_SHAPE.noteChars} characters`)
    expect(system).not.toContain(`at most ${VERDICT_SHAPE.summaryChars} characters`)
  })

  it('an answer longer than the prompt asked, but within the validator\'s limits, is accepted', () => {
    const longer = (validatorLimit: number, letter: string) => letter.repeat(asked(validatorLimit) + 1)
    const answer = {
      label: 'breaking',
      summary: longer(VERDICT_SHAPE.summaryChars, 's'),
      changes: [
        {
          title: longer(VERDICT_SHAPE.titleChars, 't'),
          whatChanged: longer(VERDICT_SHAPE.noteChars, 'w'),
          apiNames: [longer(VERDICT_SHAPE.apiNameChars, 'a')],
          whatToDo: longer(VERDICT_SHAPE.noteChars, 'd'),
        },
      ],
    }
    expect(validateVerdictResponse(answer).ok).toBe(true)
  })

  it('the shorter request asks for fewer changes', () => {
    const { system } = buildVerdictPrompt({ ...input, maxChanges: VERDICT_SHAPE.shorterChangesPerVerdict })
    expect(VERDICT_SHAPE.shorterChangesPerVerdict).toBeLessThan(VERDICT_SHAPE.changesPerVerdict)
    expect(system).toContain(`at most ${VERDICT_SHAPE.shorterChangesPerVerdict} changes, the most important first`)
    expect(system).not.toContain(`at most ${VERDICT_SHAPE.changesPerVerdict} changes`)
  })

  it('the validator accepts an answer exactly at the bounds', () => {
    expect(validateVerdictResponse(answerAtTheBounds()).ok).toBe(true)
  })

  it.each([
    ['one change too many', (a: ReturnType<typeof answerAtTheBounds>) => a.changes.push(a.changes[0])],
    ['a summary one character too long', (a: ReturnType<typeof answerAtTheBounds>) => (a.summary += 's')],
    ['a title one character too long', (a: ReturnType<typeof answerAtTheBounds>) => (a.changes[0] = { ...a.changes[0], title: a.changes[0].title + 't' })],
    ['a whatChanged one character too long', (a: ReturnType<typeof answerAtTheBounds>) => (a.changes[0] = { ...a.changes[0], whatChanged: a.changes[0].whatChanged + 'w' })],
    ['a whatToDo one character too long', (a: ReturnType<typeof answerAtTheBounds>) => (a.changes[0] = { ...a.changes[0], whatToDo: a.changes[0].whatToDo + 'd' })],
    ['one API name too many', (a: ReturnType<typeof answerAtTheBounds>) => (a.changes[0] = { ...a.changes[0], apiNames: [...a.changes[0].apiNames, 'x'] })],
    ['an API name one character too long', (a: ReturnType<typeof answerAtTheBounds>) => (a.changes[0] = { ...a.changes[0], apiNames: ['a'.repeat(VERDICT_SHAPE.apiNameChars + 1)] })],
  ])('the validator rejects %s', (_name, overBy) => {
    const answer = answerAtTheBounds()
    answer.changes = [...answer.changes]
    overBy(answer)
    expect(validateVerdictResponse(answer).ok).toBe(false)
  })

  it('the output cap fits the biggest answer the validator accepts, even pretty-printed', () => {
    const biggest = JSON.stringify(answerAtTheBounds(), null, 2)
    expect(Math.ceil(biggest.length / JUDGE.worstCaseCharsPerToken)).toBeLessThanOrEqual(JUDGE.maxOutputTokens)
  })
})

describe('readJudgeAnswer: why the model stopped', () => {
  const text = JSON.stringify(good)

  it('an answer that stopped at the output cap is a "cut off" failure, not "not valid JSON"', () => {
    expect(readJudgeAnswer({ text: '{"label": "breaking", "summary": "Express 5 rem', finishReason: 'length' })).toEqual({
      ok: false,
      cutOff: true,
      error: CUT_OFF_ERROR,
    })
    expect(CUT_OFF_ERROR).toBe('the answer was too long and was cut off')
  })

  it('is cut off even when the cut text happens to parse: the answer is incomplete', () => {
    expect(readJudgeAnswer({ text, finishReason: 'length' })).toMatchObject({ ok: false, cutOff: true })
  })

  it('an answer that stopped on its own goes to the validator', () => {
    expect(readJudgeAnswer({ text, finishReason: 'stop' })).toEqual({ ok: true, verdict: good })
    expect(readJudgeAnswer({ text: 'not json', finishReason: 'stop' })).toEqual({
      ok: false,
      error: 'response is not valid JSON',
    })
  })
})
