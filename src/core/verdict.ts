/**
 * Verdict contract: the key a verdict is cached under, the schema a model
 * response must match, the prompt that asks for it, and the validator.
 *
 * A verdict is structured and carries no confidence score (decision 6). The
 * API names it lists feed the stretch impact analysis.
 *
 * Pure: no I/O, no platform imports.
 */

import semver from 'semver'
import { z } from 'zod'
import { VERDICT_SHAPE } from '../config'
import type { VerdictChange, VerdictLabel } from './model'

/**
 * The shared cache key: package, current major, target major.minor
 * (decision 3). Everyone upgrading express 4 -> 5.1.x shares one verdict;
 * a new verdict is needed only when the target's major or minor changes.
 *
 *   verdictKey('express', '4.17.1', '5.1.0') === 'express@4->5.1'
 */
export function verdictKey(packageName: string, currentVersion: string, targetVersion: string): string {
  const current = semver.parse(currentVersion)
  const target = semver.parse(targetVersion)
  if (current === null || target === null) {
    throw new Error(`verdictKey needs two semver versions, got ${currentVersion} and ${targetVersion}`)
  }
  return `${packageName}@${current.major}->${target.major}.${target.minor}`
}

const nonEmpty = z.string().trim().min(1)

const changeSchema = z.object({
  title: nonEmpty.max(VERDICT_SHAPE.titleChars),
  whatChanged: nonEmpty.max(VERDICT_SHAPE.noteChars),
  apiNames: z.array(nonEmpty.max(VERDICT_SHAPE.apiNameChars)).max(VERDICT_SHAPE.apiNamesPerChange),
  whatToDo: nonEmpty.max(VERDICT_SHAPE.noteChars),
})

/**
 * What the model must return. Unknown keys (a "confidence" the model adds
 * on its own, say) are dropped, never stored.
 */
export const verdictResponseSchema = z
  .object({
    label: z.enum(['breaking', 'safe', 'unclear']),
    summary: nonEmpty.max(VERDICT_SHAPE.summaryChars),
    changes: z.array(changeSchema).max(VERDICT_SHAPE.changesPerVerdict),
  })
  .refine((v) => v.label !== 'breaking' || v.changes.length > 0, {
    message: 'a breaking verdict must list at least one change',
    path: ['changes'],
  })

export interface VerdictResponse {
  label: VerdictLabel
  summary: string
  changes: VerdictChange[]
}

export type VerdictValidation =
  | { ok: true; verdict: VerdictResponse }
  | { ok: false; error: string }

/**
 * Validates a model response: raw text (optionally wrapped in a ```json
 * fence) or an already-parsed object. Accepts only a response matching the
 * schema; anything else is rejected with a reason, so the engine can retry.
 */
export function validateVerdictResponse(response: unknown): VerdictValidation {
  let value = response
  if (typeof response === 'string') {
    const parsed = parseJsonText(response)
    if (!parsed.ok) return parsed
    value = parsed.value
  }
  const result = verdictResponseSchema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return { ok: false, error: `response does not match the verdict schema (${where}${issue.message})` }
  }
  return { ok: true, verdict: result.data }
}

export interface VerdictPromptInput {
  packageName: string
  fromVersion: string
  toVersion: string
  /** The sliced changelog text. Never empty: no text means no AI call (decision 5). */
  changelog: string
  /** True when the changelog was cut at the input cap. */
  truncated: boolean
}

/** The system and user prompts that ask the judge for a verdict. */
export function buildVerdictPrompt(input: VerdictPromptInput): { system: string; prompt: string } {
  const system = [
    'You read npm package changelogs and decide whether an upgrade breaks existing code.',
    'Answer with one JSON object and nothing else, matching this shape:',
    '{"label": "breaking" | "safe" | "unclear", "summary": string, "changes": [{"title": string, "whatChanged": string, "apiNames": string[], "whatToDo": string}]}',
    'Rules:',
    '- "breaking": the changelog states at least one change that can break code written for the old version. List every such change.',
    '- "safe": the changelog clearly shows no breaking change. "changes" may be empty.',
    '- "unclear": the changelog is too vague to tell. Do not guess.',
    '- "apiNames": the exact exported names, methods, options or CLI flags affected, as code would spell them. Empty if none are named.',
    '- "whatToDo": one concrete instruction for updating code.',
    '- Use only the changelog text. Do not add a confidence score or any other field.',
  ].join('\n')

  const prompt = [
    `Package: ${input.packageName}`,
    `Upgrade: ${input.fromVersion} -> ${input.toVersion}`,
    input.truncated
      ? 'Note: the changelog below was cut at a length limit; later entries are missing.'
      : 'The changelog below covers every release in this upgrade.',
    '',
    '<changelog>',
    input.changelog,
    '</changelog>',
  ].join('\n')

  return { system, prompt }
}

/**
 * Parses the JSON in a model's text. Tries, in order: the whole text, the
 * contents of a ``` fence, and the span from the first "{" to the last "}"
 * (for a reply like "Here is the verdict: {...}").
 */
function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const candidates = [text]
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fenced !== null) candidates.push(fenced[1])
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1))

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate.trim()) }
    } catch {
      // try the next candidate
    }
  }
  return { ok: false, error: 'response is not valid JSON' }
}
