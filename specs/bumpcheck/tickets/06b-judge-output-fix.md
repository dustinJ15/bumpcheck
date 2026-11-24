# 06b — Judge answers cut off (found by the live check)

**Status:** done

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

## Completion

Completed 2026-11-24 on `ralph/bumpcheck`.

**What was built**

- `src/core/verdict.ts`: `readJudgeAnswer({ text, finishReason })`, the pure mapping. A
  `finishReason` of `'length'` (the AI SDK's value for "hit `maxOutputTokens`"; `FinishReason` in
  `ai@7.0.107` is `'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other'`)
  becomes `{ ok: false, cutOff: true, error: CUT_OFF_ERROR }` ("the answer was too long and was
  cut off"); anything else goes to the validator as before. The prompt now takes `maxChanges`
  and states every bound from config: at most N changes, the most important first (more go in
  the summary), and the character limits for each field.
- `src/config.ts`: `VERDICT_SHAPE` tightened to summary 400, 8 changes (3 in the shorter retry,
  `shorterChangesPerVerdict`), title 100, notes 300 each, 5 API names of 60. `JUDGE.maxOutputTokens`
  1,500 -> 3,500, with the arithmetic in a comment: the biggest valid answer, pretty-printed,
  is 9,789 characters; at a cautious 3 characters per token (`JUDGE.worstCaseCharsPerToken`)
  that is 3,263 tokens; 3,500 leaves room for escapes and a fence. A unit test redoes the sum.
- `src/services/claude-judge.ts`: passes `result.finishReason` to `readJudgeAnswer`.
- `src/services/types.ts`: `JudgeResult` failure carries an optional `cutOff: true`.
- `src/engine/scan.ts` (`judgeNext`): the first attempt asks for `changesPerVerdict`; if it was
  cut off, the retry asks for `shorterChangesPerVerdict`. Any other failure retries the same
  request. The ceiling check before the retry and the AI-call count are unchanged.
- `src/services/fakes.ts`: `FAKE_CUT_OFF`, returned from a responder, makes the fake judge answer
  half a JSON object with `finishReason: 'length'` through the real `readJudgeAnswer`.
- `tests/live/live-check.live.ts` (written, **not run**): after the scan it prints every verdict on
  the project page (package, state, badge, and the failure note for a failed one), presses the
  real `retry-verdict` once for each failed verdict and waits for each check, prints the
  verdicts again and the credits the retries used. Test timeout raised to 30 minutes in the
  test, since each retry is waited for in turn.
- `specs/bumpcheck/spec.md`: the limits table shows the new output cap and verdict size.

**Red/green log** (first run, before any implementation)

- `the prompt states every bound from config`: `expected 'You read npm package changelogs and d…' to contain 'at most 30 changes, the most importan…'`
- `the shorter request asks for fewer changes`: `TypeError: actual value must be number or bigint, received "undefined"` (no `shorterChangesPerVerdict`)
- `the output cap fits the biggest answer the validator accepts, even pretty-printed`: `expected NaN to be less than or equal to 1500` (no `worstCaseCharsPerToken`; at the old bounds it would also fail)
- `an answer that stopped at the output cap is a "cut off" failure, not "not valid JSON"`: `TypeError: readJudgeAnswer is not a function`
- `is cut off even when the cut text happens to parse: the answer is incomplete`: `TypeError: readJudgeAnswer is not a function`
- `an answer that stopped on its own goes to the validator`: `TypeError: readJudgeAnswer is not a function`
- engine `is retried with the shorter request, and the retry is stored as ready`: `expected [ undefined, undefined ] to deeply equal [ 30, undefined ]`
- engine `twice is stored as failed, with the "cut off" reason`: stored `failureReason: "response does not match the verdict schema (Invalid input: expected object, received undefined)"`
- engine `a failure that was not a cut-off is retried with the same request`: `expected [ undefined, undefined ] to deeply equal [ 30, 30 ]`
- `the validator accepts an answer exactly at the bounds` and the seven `the validator rejects ...`
  cases: green on the first run, because the validator already enforced `VERDICT_SHAPE`. Seen red
  by mutation instead: dropping `.max(VERDICT_SHAPE.noteChars)` failed 2 tests, dropping
  `.max(VERDICT_SHAPE.apiNamesPerChange)` failed 1.
- engine `the shorter retry is still checked against the daily ceiling`: green on the first run
  (the ceiling check already existed); it pins that the cut-off path keeps it.

Mutations run by hand after the change, each red: removing the shorter-retry line in
`judgeNext` (1 failed), removing the `'length'` check in `readJudgeAnswer` (4 failed), removing
the changes bound from the prompt (2 failed), and the two validator mutations above.

**Left undone / unverified**

- The live check was written, type-checked and linted only; never run (rule 7). Whether Haiku
  keeps near the character limits it is asked for is unproven; the headroom below makes a
  little over harmless, but an answer past the validator's limit is still rejected.
- `ClaudeJudge` itself has no test (it would need a real or mocked AI call); only the pure
  mapping it calls is tested. Replacing its `readJudgeAnswer` call with `validateVerdictResponse`
  would leave the gate green.
- No screenshot (ticket: changes no page).

**Follow-up from the supervisor: headroom between prompt and validator**

- `JUDGE.promptShare: 0.6` in `src/config.ts`. The prompt states each character limit as
  `Math.floor(VERDICT_SHAPE.x * JUDGE.promptShare)`: summary 240, title 60, notes 180 each, API
  names 36 characters. The validator, the output cap and the cap test are unchanged, still sized
  for the validator's maxima (400 / 100 / 300 / 60). The number of changes (8, then 3) and the
  number of API names per change (5) are not scaled: prompt and validator agree on counts.
- The prompt no longer says "an answer over these limits is rejected", since what it states is
  now below the rejection line.

Red/green for the follow-up:

- `the prompt states every bound from config, the character limits reduced by JUDGE.promptShare`
  (replaces `the prompt states every bound from config`): `TypeError: actual value must be number or bigint, received "undefined"` (no `JUDGE.promptShare`).
  Also seen red by mutation after the change: making the prompt state the validator's own limits
  failed this test.
- `an answer longer than the prompt asked, but within the validator's limits, is accepted`:
  `AssertionError: expected false to be true` (before `promptShare` existed the helper made empty
  strings, which the validator rejects; so this red was from the missing setting, not from the
  validator). After the change it passes because the validator keeps its larger limits; it pins
  that the validator stays above what the prompt asks.

**Gate** (`npm run gate`, final tree, after the follow-up)

```

> bumpcheck@0.0.1 gate
> npm run lint && npm run type-check && npm run test:unit && npm run test:smoke && npm run test:api && npm run test:signed-in


> bumpcheck@0.0.1 lint
> eslint .


> bumpcheck@0.0.1 type-check
> tsc --noEmit


> bumpcheck@0.0.1 test:unit
> vitest run --passWithNoTests


 RUN  v4.1.12 /home/dustin/sync/code/personal/deep-space/bumpcheck


 Test Files  33 passed (33)
      Tests  652 passed (652)
   Start at  05:44:26
   Duration  2.44s (transform 3.40s, setup 0ms, import 11.39s, tests 1.36s, environment 6ms)


> bumpcheck@0.0.1 test:smoke
> deepspace test run smoke

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:44:36 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5064 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] The Local Explorer API is available at http://127.0.0.1:5173/cdn-cgi/local/explorer/api
[WebServer] Useful routes:
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/workers - local Workers and bindings
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=<name> - invoke a Worker's scheduled handler; cron is required (see the OpenAPI schema for the full request)
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/storage/kv/namespaces - KV namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/d1/database - D1 databases
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/r2/buckets - R2 buckets
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces - Durable Object namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workflows - Workflows
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query - run a read-only SQL query (SELECT/WITH only) over captured request traces and console logs. Tables: spans, logs (read attributes via json(attributes)). Example:
[WebServer]     curl -X POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query -H 'Content-Type: application/json' -d '{"sql":"SELECT service, name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}'
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/clear - clear all captured traces and logs
[WebServer] If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort):
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api - OpenAPI schema
[WebServer] 

Running 6 tests using 1 worker

  ✓  1 tests/smoke.spec.ts:21:3 › Smoke tests › static landing loads without JS errors (763ms)
  ✓  2 tests/smoke.spec.ts:29:3 › Smoke tests › landing carries one title, one description, one canonical (403ms)
  ✓  3 tests/smoke.spec.ts:40:3 › Smoke tests › static contract: landing fires no auth request, opens no websocket (1.9s)
  ✓  4 tests/smoke.spec.ts:55:3 › Smoke tests › dynamic app boundary mounts on /home (551ms)
  ✓  5 tests/smoke.spec.ts:60:3 › Smoke tests › sign-in button visible when logged out (479ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  6 tests/smoke.spec.ts:66:3 › Smoke tests › unknown route shows 404 (397ms)

  6 passed (13.3s)

> bumpcheck@0.0.1 test:api
> deepspace test run api

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:44:53 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5077 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] The Local Explorer API is available at http://127.0.0.1:5173/cdn-cgi/local/explorer/api
[WebServer] Useful routes:
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/workers - local Workers and bindings
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=<name> - invoke a Worker's scheduled handler; cron is required (see the OpenAPI schema for the full request)
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/storage/kv/namespaces - KV namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/d1/database - D1 databases
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/r2/buckets - R2 buckets
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces - Durable Object namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workflows - Workflows
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query - run a read-only SQL query (SELECT/WITH only) over captured request traces and console logs. Tables: spans, logs (read attributes via json(attributes)). Example:
[WebServer]     curl -X POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query -H 'Content-Type: application/json' -d '{"sql":"SELECT service, name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}'
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/clear - clear all captured traces and logs
[WebServer] If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort):
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api - OpenAPI schema
[WebServer] 

Running 2 tests using 1 worker

  ✓  1 tests/api.spec.ts:4:3 › API tests › auth proxy forwards to auth worker (102ms)
  ✓  2 tests/api.spec.ts:9:3 › API tests › WebSocket endpoint exists (886ms)

  2 passed (9.5s)

> bumpcheck@0.0.1 test:signed-in
> deepspace test run tests/projects.spec.ts && deepspace test run tests/project-page.spec.ts && deepspace test run tests/sharing.spec.ts && deepspace test run tests/alerts.spec.ts && deepspace test run tests/scheduling.spec.ts

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:45:06 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4882 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] The Local Explorer API is available at http://127.0.0.1:5173/cdn-cgi/local/explorer/api
[WebServer] Useful routes:
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/workers - local Workers and bindings
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=<name> - invoke a Worker's scheduled handler; cron is required (see the OpenAPI schema for the full request)
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/storage/kv/namespaces - KV namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/d1/database - D1 databases
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/r2/buckets - R2 buckets
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces - Durable Object namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workflows - Workflows
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query - run a read-only SQL query (SELECT/WITH only) over captured request traces and console logs. Tables: spans, logs (read attributes via json(attributes)). Example:
[WebServer]     curl -X POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query -H 'Content-Type: application/json' -d '{"sql":"SELECT service, name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}'
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/clear - clear all captured traces and logs
[WebServer] If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort):
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api - OpenAPI schema
[WebServer] 

Running 10 tests using 1 worker

[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   1 tests/projects.spec.ts:73:1 › the projects list starts empty, a project is added, and its first scan finishes while watching (4.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   2 tests/projects.spec.ts:105:1 › adding the same repo twice is refused with its own message (2.4s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   3 tests/projects.spec.ts:119:1 › the project limit is reported, and nothing is added past it (2.8s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
  ✓   4 tests/projects.spec.ts:140:1 › add requests sent at the same moment cannot get past the project limit (3.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   5 tests/projects.spec.ts:156:1 › a repo that cannot be scanned is refused with the reason, inline (2.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
  ✓   6 tests/projects.spec.ts:178:1 › one user's projects are not in another user's list (3.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   7 tests/projects.spec.ts:193:1 › an action needs a verified sign-in: no token, no project (66ms)
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
  ✓   8 tests/projects.spec.ts:205:3 › the job room is locked down › a member cannot enqueue a job, and cannot read the queue (5.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/projects.spec.ts:228:3 › the job room is locked down › a signed-out visitor cannot enqueue a job either (2.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/projects.spec.ts:239:1 › a signed-in member cannot call an owner-billed integration from the browser (678ms)

  10 passed (36.7s)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:45:47 AM [generouted] scanned 9 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5300 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] The Local Explorer API is available at http://127.0.0.1:5173/cdn-cgi/local/explorer/api
[WebServer] Useful routes:
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/workers - local Workers and bindings
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=<name> - invoke a Worker's scheduled handler; cron is required (see the OpenAPI schema for the full request)
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/storage/kv/namespaces - KV namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/d1/database - D1 databases
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/r2/buckets - R2 buckets
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces - Durable Object namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workflows - Workflows
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query - run a read-only SQL query (SELECT/WITH only) over captured request traces and console logs. Tables: spans, logs (read attributes via json(attributes)). Example:
[WebServer]     curl -X POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query -H 'Content-Type: application/json' -d '{"sql":"SELECT service, name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}'
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/clear - clear all captured traces and logs
[WebServer] If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort):
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api - OpenAPI schema
[WebServer] 

Running 14 tests using 1 worker

[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   1 tests/project-page.spec.ts:76:1 › the report sorts every dependency into its group and section, each in its own state (3.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   2 tests/project-page.spec.ts:167:1 › a verdict is marked as reviewed, moves to the collapsed section, and undo brings it back (3.8s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   3 tests/project-page.spec.ts:207:1 › the server refuses to review a verdict that is not in the project, or a failed one (4.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   4 tests/project-page.spec.ts:226:1 › a change made in one tab appears in a second tab (3.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   5 tests/project-page.spec.ts:251:1 › the projects list shows each project's count of unreviewed breaking upgrades (3.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "undo-reviewed" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "check-dependency" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "retry-verdict" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "record-opened" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "mark-reviewed" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   6 tests/project-page.spec.ts:277:1 › Bob cannot see Alice's private project by URL, and cannot act on it (9.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   7 tests/project-page.spec.ts:324:1 › "check this one" reads only that dependency, and progress shows while it runs (6.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/project-page.spec.ts:372:1 › a second request while a check is running is refused: one scan at a time (5.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   9 tests/project-page.spec.ts:389:1 › a verdict read from a later version is not shown to a project on an older one, until its own check reads the wider range (9.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  10 tests/project-page.spec.ts:420:1 › a check that cannot finish says so, keeps the report, and can be asked again (9.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  11 tests/project-page.spec.ts:447:1 › a failed verdict has a retry button, and retrying judges that verdict again (3.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
  ✓  12 tests/project-page.spec.ts:484:1 › scan progress is shown live while the first scan runs (6.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  13 tests/project-page.spec.ts:505:1 › a project with no dependencies shows an empty state, not an empty page (2.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  14 tests/project-page.spec.ts:516:1 › opening a project records that it was opened (2.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  14 passed (1.4m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:47:12 AM [generouted] scanned 9 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5143 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] The Local Explorer API is available at http://127.0.0.1:5173/cdn-cgi/local/explorer/api
[WebServer] Useful routes:
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/workers - local Workers and bindings
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=<name> - invoke a Worker's scheduled handler; cron is required (see the OpenAPI schema for the full request)
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/storage/kv/namespaces - KV namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/d1/database - D1 databases
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/r2/buckets - R2 buckets
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces - Durable Object namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workflows - Workflows
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query - run a read-only SQL query (SELECT/WITH only) over captured request traces and console logs. Tables: spans, logs (read attributes via json(attributes)). Example:
[WebServer]     curl -X POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query -H 'Content-Type: application/json' -d '{"sql":"SELECT service, name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}'
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/clear - clear all captured traces and logs
[WebServer] If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort):
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api - OpenAPI schema
[WebServer] 

Running 10 tests using 1 worker

[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   1 tests/sharing.spec.ts:156:1 › a project is private until its owner switches it to public on the settings page, which then shows the link (6.1s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   2 tests/sharing.spec.ts:204:1 › a public report is readable signed-out, offers no actions, and what the reader received names nobody (10.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [action] "scan-now" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "mark-reviewed" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "check-dependency" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "set-visibility" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   3 tests/sharing.spec.ts:298:1 › another signed-in user reads a public report the same way: no actions, no owner (12.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   4 tests/sharing.spec.ts:335:1 › a private project's link shows "not available", signed-out and to Bob, exactly like a link to nothing (15.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   5 tests/sharing.spec.ts:391:1 › switching back to private removes access, even from a page that is already open (12.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "set-visibility" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   6 tests/sharing.spec.ts:430:1 › only the owner can change who sees a project (16.8s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   7 tests/sharing.spec.ts:499:1 › a public report follows its project: a check that finishes shows up for the reader (5.6s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-publish-example" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   8 tests/sharing.spec.ts:518:1 › the landing page says what bumpcheck does, links to the example report, and offers sign-in (3.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/sharing.spec.ts:556:1 › the test-only example fixture is not an open door (17ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/sharing.spec.ts:561:1 › nothing public is left behind (5.2s)

  10 passed (1.7m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:48:55 AM [generouted] scanned 9 routes in 14 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 6210 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] The Local Explorer API is available at http://127.0.0.1:5173/cdn-cgi/local/explorer/api
[WebServer] Useful routes:
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/workers - local Workers and bindings
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=<name> - invoke a Worker's scheduled handler; cron is required (see the OpenAPI schema for the full request)
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/storage/kv/namespaces - KV namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/d1/database - D1 databases
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/r2/buckets - R2 buckets
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces - Durable Object namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workflows - Workflows
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query - run a read-only SQL query (SELECT/WITH only) over captured request traces and console logs. Tables: spans, logs (read attributes via json(attributes)). Example:
[WebServer]     curl -X POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query -H 'Content-Type: application/json' -d '{"sql":"SELECT service, name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}'
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/clear - clear all captured traces and logs
[WebServer] If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort):
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api - OpenAPI schema
[WebServer] 

Running 9 tests using 1 worker

[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  1 tests/alerts.spec.ts:142:1 › alerts are off by default; the settings toggles persist across a reload (7.4s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 29ms
[WebServer] [alert] sent, 2 verdicts
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 29ms
[WebServer] [alert] not sent: nothing-new
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  2 tests/alerts.spec.ts:180:1 › a daily scan sends one alert to the owner, logs it, and does not send it again (9.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "delete-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  3 tests/alerts.spec.ts:232:1 › a test send appears in the log, and the fourth test send in a day is refused (8.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  4 tests/alerts.spec.ts:288:1 › a test email that cannot be sent is shown as failed, with the reason (3.9s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  5 tests/alerts.spec.ts:310:1 › the unsubscribe link turns alerts off while signed out: the page asks once, and one click does it (6.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  6 tests/alerts.spec.ts:362:1 › a mail client's one-click POST unsubscribes without a sign-in, and only the project the link names (7.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  7 tests/alerts.spec.ts:398:1 › a bad unsubscribe link gets a plain error page (123ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-alerts" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "send-test-email" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "delete-project" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-email-allowance" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-read-outbox" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  8 tests/alerts.spec.ts:410:1 › only the owner can change alerts, send a test, or delete a project (10.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "send-test-email" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "delete-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [alert] not sent: alerts-off
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  9 tests/alerts.spec.ts:448:1 › delete removes the project, its send log and its public report, and frees a slot (17.8s)

  9 passed (1.4m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:50:21 AM [generouted] scanned 9 routes in 15 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 6383 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] The Local Explorer API is available at http://127.0.0.1:5173/cdn-cgi/local/explorer/api
[WebServer] Useful routes:
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/workers - local Workers and bindings
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=<name> - invoke a Worker's scheduled handler; cron is required (see the OpenAPI schema for the full request)
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/storage/kv/namespaces - KV namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/d1/database - D1 databases
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/r2/buckets - R2 buckets
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces - Durable Object namespaces
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api/workflows - Workflows
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query - run a read-only SQL query (SELECT/WITH only) over captured request traces and console logs. Tables: spans, logs (read attributes via json(attributes)). Example:
[WebServer]     curl -X POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/query -H 'Content-Type: application/json' -d '{"sql":"SELECT service, name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}'
[WebServer]   POST http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/observability/clear - clear all captured traces and logs
[WebServer] If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort):
[WebServer]   GET http://127.0.0.1:5173/cdn-cgi/local/explorer/api - OpenAPI schema
[WebServer] 

Running 13 tests using 1 worker

[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 5ms
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 29ms
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 6ms
  ✓   1 tests/scheduling.spec.ts:132:1 › the scheduled task, triggered directly, re-scans a due project and leaves one that is not due (9.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 6ms
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 37ms
[WebServer] [alert] not sent: alerts-off
  ✓   2 tests/scheduling.spec.ts:163:1 › an idle project is not scanned until its owner opens it again (7.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   3 tests/scheduling.spec.ts:194:1 › scan now inside the cooldown shows a notice with the time it returns; after the cooldown it scans (4.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "scan-now" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   4 tests/scheduling.spec.ts:236:1 › scan now is refused while a scan is running: one scan at a time (6.7s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 31ms
[WebServer] [alert] not sent: alerts-off
  ✓   5 tests/scheduling.spec.ts:260:1 › a scan that stops at its limit says so, and a later scan reads the rest (4.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-use-up-daily-ai-limit" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 26ms
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   6 tests/scheduling.spec.ts:293:1 › the app's daily AI limit stops the judge on every path, and the page says it is a limit (4.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 6ms
  ✓   7 tests/scheduling.spec.ts:339:1 › a failed scan shows its reason and a retry, and the retry is under the cooldown (15.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/scheduling.spec.ts:377:1 › an upgrade whose release notes GitHub refused is shown as not read this time, with no verdict (2.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/scheduling.spec.ts:393:1 › add-project attempts are capped per user per day, and the refusal says when the cap resets (11.3s)
[WebServer] [alert] not sent: alerts-off
  ✓  10 tests/scheduling.spec.ts:426:3 › the cron room is locked down › a member cannot trigger, pause or resume the scheduled task (4.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  11 tests/scheduling.spec.ts:433:3 › the cron room is locked down › a signed-out visitor cannot either (4.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  12 tests/scheduling.spec.ts:439:3 › the cron room is locked down › the test-only trigger is not an open door: it needs a sign-in (18ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  13 tests/scheduling.spec.ts:445:1 › nothing is left behind for the next run of the scheduled task (2.8s)

  13 passed (1.5m)
```
