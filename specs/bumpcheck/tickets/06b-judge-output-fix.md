# 06b — Judge answers cut off (found by the live check)

**Status:** ready-for-agent

**Who:** worker · **Changes a page:** no · **Blocked by:** 06
**Stories:** 14, 18, 22 · **Decisions:** 5, 6, 7

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.
Added by the supervisor on 2026-11-24 after the first live check.

## What the live check found

One real scan of `dustinJ15/bumpcheck-example` made 19 Claude calls for 12 majors. Seven of
the 12 verdicts were stored as `failed` with "response is not valid JSON", each after two
paid attempts: commander, date-fns, express, uuid, eslint, prettier, vite. Four of the seven
had a cut changelog (the biggest inputs). The five that worked were chalk, dotenv,
node-fetch, zod (unclear) and typescript (unclear).

Likely cause, not yet proven: the output cap (`JUDGE.maxOutputTokens`, 1,500) cuts the
answer off mid-JSON. The prompt in `src/core/verdict.ts` sets no limit on the number of
changes or the length of each note, while `VERDICT_SHAPE` allows 30 changes of up to 2,000
characters each. `src/services/claude-judge.ts` passes `result.text` to the validator without
looking at why the model stopped.

## Build

- **Tell the two failures apart.** The real judge reads the AI SDK's finish reason. An answer
  that stopped because it hit the output cap becomes a typed failure with its own reason
  ("the answer was too long and was cut off"), not "not valid JSON". Check the installed `ai`
  package's types for the exact field and values.
- **Keep answers inside the cap.** The prompt asks for at most a bounded number of changes
  (the most important first) and short fields, with the bounds in `src/config.ts` and the
  validator's `VERDICT_SHAPE` consistent with them. Raise the output cap only as far as the
  bounded answer needs, with the arithmetic in a comment; Haiku output is cheap, but the cap
  is decision 7 and must stay explicit.
- **Do not pay twice for a cut answer.** If the first attempt was cut off at the cap, the
  retry asks for a shorter answer (fewer changes), rather than repeating the same request.
- **The live check shows verdict statuses.** `tests/live/live-check.live.ts` prints each
  verdict's package, status and label after the scan, and the failure reason for any failed
  one, so the next live check shows at a glance whether this fix worked. Before scanning, it
  must not be fooled by verdicts cached from an earlier run: for every verdict of the example
  repo that is already stored as `failed`, after the scan it presses the real "retry"
  action once and waits for it, so the fixed judge is what gets measured. Print what that
  cost. **Write it; do not run it.**

## Tests required

- Unit: the prompt states the bounds from config; the validator accepts an answer at the
  bounds and rejects one over them; a judge result whose finish reason is the length limit is
  a failure with the "cut off" reason (test the pure mapping, not a real call).
- Engine: a first attempt cut off at the cap is retried with the shorter request, and the
  retry's success is stored as ready; two cut-off attempts store `failed` with the "cut off"
  reason. The fakes need a way to answer "cut off".

## Done means

Acceptance: the above holds against the fakes; the gate is green; no real service called.
Evidence: the full pasted output of `npm run gate` and the Red/green log in a `## Completion`
section below. No screenshot.
