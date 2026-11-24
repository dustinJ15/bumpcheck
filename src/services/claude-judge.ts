/**
 * The real judge: Claude, through the platform's AI helper.
 *
 * `createDeepSpaceAI(env, 'anthropic')` with no auth token uses the app
 * owner's token, so every call bills the owner. That is the only option for
 * a job (spec, "Platform facts").
 *
 * The model, output cap and input cap come from src/config.ts (decision 7).
 * Without an explicit output cap the platform reserves 64,000 output tokens
 * per call.
 *
 * One call per `judge()`: the AI SDK's own retries are turned off
 * (`maxRetries: 0`), because the scan engine does the retrying. It makes
 * `JUDGE.attemptsPerVerdict` attempts and counts each one against the daily
 * AI ceiling, so a hidden retry here would be an uncounted paid call.
 *
 * Never called by a test: only the supervisor's live check and production
 * reach Claude.
 */

import { generateText } from 'ai'
import { createDeepSpaceAI, type DeepSpaceAIEnv } from 'deepspace/worker'
import { JUDGE, SCAN_PACING } from '../config'
import { buildVerdictPrompt, readJudgeAnswer, type VerdictPromptInput } from '../core/verdict'
import type { Judge, JudgeResult } from './types'

export class ClaudeJudge implements Judge {
  constructor(private readonly env: DeepSpaceAIEnv) {}

  async judge(input: VerdictPromptInput): Promise<JudgeResult> {
    // The slicer already cuts at the cap; this keeps the cap true even if a caller forgets.
    const overCap = input.changelog.length > JUDGE.changelogInputCapChars
    const { system, prompt } = buildVerdictPrompt({
      ...input,
      changelog: input.changelog.slice(0, JUDGE.changelogInputCapChars),
      truncated: input.truncated || overCap,
    })

    try {
      const anthropic = createDeepSpaceAI(this.env, 'anthropic')
      const result = await generateText({
        model: anthropic(JUDGE.model),
        system,
        prompt,
        maxOutputTokens: JUDGE.maxOutputTokens,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(SCAN_PACING.judgeTimeoutMs),
      })
      // finishReason 'length' means the answer hit maxOutputTokens and is incomplete.
      return readJudgeAnswer({ text: result.text, finishReason: result.finishReason })
    } catch (error) {
      return { ok: false, error: `the AI call failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
}
