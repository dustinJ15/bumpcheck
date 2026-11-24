# 02 — Add-project flow

**Status:** done

**Who:** worker · **Changes a page:** yes · **Blocked by:** 01
**Stories:** 3, 5–10, 23, 58 · **Decisions:** 1, 4, 7, 14, 15, 17

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

## Goal

A signed-in user enters a repo, the project appears, and its first scan runs to completion as
a background job. In tests, all of it runs against the fakes.

## Build

**Real implementations** behind ticket 01's interfaces. Write and type-check them; do not call
them.

- Package registry: the npm registry over plain `fetch` (latest version, published versions,
  source repo location including a monorepo subfolder).
- Source host: the GitHub integration for repo metadata, tree and single files; plain `fetch`
  to GitHub's public Releases API as the best-effort fallback. A refused fallback degrades to
  "no changelog found".
- Judge: Claude through the platform's AI helper for jobs, model and caps from the config
  module (`claude-haiku-5-5`, output cap, input cap). Two attempts, then a typed failure.
- Record store and clock for the worker.

Where the docs and the installed `deepspace` types disagree, the installed types and the CLI
catalog win.

**Job handler** (`src/jobs.ts`): a `scan` job carrying only a project id and whether it is
on-demand. It runs engine steps until the tick's outbound-call budget is used, then continues
on the next tick with saved state. It wires real or fake implementations through ticket 01's
setting.

**Job room locked down** (`worker.ts`): enqueue, cancel and retry from the owner role only.
Members cannot enqueue or read jobs.

**Integration billing** (`src/integrations.ts`): GitHub owner-billed; nothing callable by
signed-out visitors.

**Add-project action** (`src/actions/`): verifies the caller from the platform's verified
identity; accepts `owner/repo` or a GitHub URL; refuses with a specific message for each of:
repo not found or private; no root `package.json`; invalid JSON; more than 150 dependencies;
project limit reached; same repo already added by this user. On success creates the project
and enqueues its first scan.

**Projects list page** (protected): the user's projects with scan status, the add form with
its inline error messages, and an empty state. Replace the scaffold's `/home` nav entry.

**Live-check command:** add `npm run live-check`. It runs one real scan of
`dustinJ15/bumpcheck-example` and prints what it spent. Leave a clearly marked place for
ticket 06 to add the test email. **Write it; do not run it.** It is not part of the gate.

## Tests required

- Unit: repo input parsing (`owner/repo`, URL forms, junk); each refusal message.
- Browser, using the SDK testing fixture and the existing test accounts (Alice and Bob; do not
  create accounts): add a project and watch its scan finish; adding the same repo twice is
  refused; the project limit is reported.
- A test that a member-role client cannot enqueue a job.

## Supervisor step after this ticket (not worker work)

The supervisor or Dustin runs `npm run live-check` once and records the spend.

## Done means

Acceptance: the flows above work against the fakes; the gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and a
screenshot from `npx deepspace test screenshot` of the projects list (empty and with a
project), saved under `specs/bumpcheck/evidence/02/`.

## Completion

Completed 2026-11-23 on `ralph/bumpcheck`.

**What was built**

- Real implementations (written and type-checked, never called by a test or by the worker
  that built them): `src/services/npm-registry.ts` (plain `fetch`),
  `src/services/github-source-host.ts` (GitHub integration for metadata and files, plain
  `fetch` to the public Releases API as fallback), `src/services/claude-judge.ts`
  (`createDeepSpaceAI` + `generateText`, model and caps from `src/config.ts`, SDK retries
  off), `src/services/record-room-store.ts` (record store and clock). Their pure helpers
  (URL building, response reading) are unit-tested in `src/services/real-helpers.test.ts`.
- `src/services/wire.ts`: the one place real or fake is chosen, through `servicesMode(env)`.
  `src/services/fake-world.ts`: fixed fake repos and packages for the local test server
  (`bumpcheck-fake/demo` has one dependency in each state a scan can produce).
- Job: `src/jobs.ts` (thin), `src/engine/scan-job.ts` (one run of the job, with the retry
  rule), `src/engine/tick.ts` (steps until the outbound-call budget is used),
  `src/server/scan-queue.ts` (`enqueueScan`, payload is `{ projectId, onDemand }` only).
- Job room locked down in `worker.ts`: `authorizeWrite` and `authorizeRead` both require the
  admin (owner) role.
- `src/integrations.ts`: `github` and `email` owner-billed, nothing anonymous. See "Judgment
  calls" for the browser proxy.
- Add-project: `src/core/repo-input.ts` (input parsing), `src/engine/manifest.ts` (shared
  with the scan engine, so both give the same reason in the same words),
  `src/engine/add-project.ts` (the check, each refusal with its own message),
  `src/actions/add-project.ts` (the server action), `src/lib/actions.ts` (browser helper).
- Page: `src/pages/(app)/(protected)/projects.tsx`. `/home` now redirects to `/projects`
  and the nav entry is "Projects".
- Live check: `npm run live-check` (`tests/live/`). **Written, not run.**
- Gate: `npm run test:signed-in` (`deepspace test run tests/projects.spec.ts`) added as the
  last step.
- Config additions in `src/config.ts` (`SCAN_PACING`): `outboundCallsPerTick` 30,
  `outboundTimeoutMs`, `judgeTimeoutMs`, `failedTicksPerScan` 2, `retryDelayMs`,
  `jobRunsPerScan` 60.

**How the job room lock-down is tested** (`tests/projects.spec.ts`, "the job room is locked
down"): Alice (a member) opens the job room's WebSocket with her real token after a real job
has run. The room answers `canWrite: false` and an empty job snapshot; her `job.enqueue` is
answered "Write access denied" and no job is announced. The same for a signed-out visitor.
Checked once by hand that the test fails when the scaffold's member rule is put back.

**Evidence**

- `specs/bumpcheck/evidence/02/projects-empty.png`: projects list, empty (browser test's
  own capture, signed in as Alice).
- `specs/bumpcheck/evidence/02/projects-with-project.png`: projects list with a scanned
  project (browser test's own capture).
- `specs/bumpcheck/evidence/02/projects-signed-out.png`: taken with `npx deepspace test
  screenshot` against a local server started with the fake-services setting.
- **`npx deepspace test screenshot` cannot reach a signed-in page**: it has no sign-in
  option, so it shows the "Sign in to continue" panel. The two signed-in captures are
  therefore the browser test's own, copied from its output folder after the final gate run.

**Platform facts checked against the installed SDK 0.44.2**

- `JobRoomConfig.authorizeWrite` / `authorizeRead` exist and are re-checked on every enqueue,
  cancel and retry message; a reader who may not read gets an empty snapshot. As the spec says.
- **Different from what the spec implies:** the job room adds one to a job's `attempts` on
  every run of the handler, including each run resumed by `ctx.continue`. So `maxAttempts`
  cannot express "retried once" for a scan that takes several ticks. The retry rule is kept
  in `src/engine/scan-job.ts` (a count of failed ticks in the checkpoint); `maxAttempts` is
  used only as a cap on runs (`jobRunsPerScan`).
- `enqueueJob` from server code goes through the worker's binding and is not subject to the
  authorize checks. As the spec says.
- The GitHub integration has `get-repository`, `get-repository-contents` and
  `get-repository-tree`, and no releases endpoint. The CLI catalog gives input schemas only
  (`outputSchema: null`), so the response shapes are assumed to be GitHub's own (see
  "Unverified").

**Judgment calls (please confirm)**

- **Browser integration proxy closed.** The scaffold's `/api/integrations/:name/:endpoint`
  lets any signed-in user call any owner-billed integration from the browser, including ones
  not listed in `src/integrations.ts` (unlisted means owner-billed). That contradicts story
  58, so the route now answers 403 unless the integration is in
  `browserCallableIntegrations`, which is empty. Server actions and jobs are unaffected.
  Tested in `tests/projects.spec.ts` with an endpoint name that does not exist, so the test
  cannot reach a paid call even if the guard were removed.
- **Test-only action `test-reset-my-projects`** (`src/actions/test-reset.ts`): the local
  record room keeps data between runs and there is no delete action until ticket 06, so the
  browser tests empty the test account's project list first. It answers "Action not found"
  unless the fake-services setting is on, and only ever deletes the caller's own rows.
  Ticket 06 can replace it with the real delete action.
- Repo owner and name are stored lowercased; the page shows them lowercased.
- The check order is: input, duplicate, project limit, then GitHub. A refused request for
  the first three costs no GitHub call (unit-tested).
- After creating the row the action counts the user's projects again and removes the row if
  simultaneous requests put the user over the limit (browser-tested).
- npm: one small request (`/<name>/latest`) per package; the full package document is
  fetched only when `latest` is a prerelease.
- Releases fallback: the newest 100 releases, one unauthenticated request. For a package in
  a monorepo subfolder only `pkg@1.2.3` tags are kept; plain `v1.2.3` tags there are dropped,
  because they cannot be attributed to one package. That means "no changelog found" for
  monorepos that tag releases without the package name and have no per-package
  `CHANGELOG.md`.
- A scan job that fails does not throw: the failure is written to the project row and the
  job ends with `outcome: "failed"` in its result. Throwing would hand the retry decision
  back to the room's attempt count.
- Two small fixes to ticket 01's engine, found in review: registry answers are looked up
  with `Object.hasOwn`, so a dependency named `constructor` or `toString` scans normally;
  a `__proto__` key in package.json is ignored. Both have engine tests.

**Left undone, unverified, or open**

- **The live check was not run** (worker rule). Nothing real has been called: account usage
  read before the final gate showed 0 credits used.
- **Unverified until the live check:** the response shapes of `github/get-repository`
  (assumed `default_branch`) and `github/get-repository-contents` (assumed GitHub's
  `{ type, encoding: "base64", content }`); how the integration reports a missing repo or
  file (assumed status 404 or an error text containing "not found"); the `ai` SDK call
  shape against the real proxy; npm's `/latest` endpoint for scoped names. If a shape is
  wrong the scan fails loudly ("unexpected repository data") instead of guessing.
- **The live check's "spent" figure** is the account's `totalUsed` before and after, read
  with `npx deepspace app usage --json`. Usage may be recorded late; the command says so.
- **The live check can add the example repo only once** per test account until delete
  exists (ticket 06). A second run stops with a message and spends nothing.
- **Open, for the supervisor to decide: add-project has no rate limit.** Each well-formed,
  non-duplicate request from a user under the project limit costs the owner one or two
  GitHub calls before it is refused or accepted. A signed-in user could loop it. A per-user
  cap is a new limit, so it was not added here.
- **Open: a refused Releases request is cached as "no changelog found".** The engine stores
  a `no-changelog` verdict in the shared cache, and the source host cannot tell "no
  releases" from "GitHub refused". A rate-limited moment therefore becomes a lasting "no
  changelog found" for that upgrade, for everyone, until the target's minor version changes.
  Fixing it needs the interface to tell the two apart and a decision on what to store.
- **Open, for ticket 04:** a project row can stay "scanning" or "queued" if the job room
  ends a job without calling the handler (the owner cancels between ticks, or the room gives
  up after its run cap). Nothing times these out yet. Still true from ticket 01: a scan that
  fails does not set `lastScanAt`.
- A scan that throws mid-tick retries from the last completed step, so at most one step's
  calls are repeated.
- On a fresh checkout the first test-server start may log vite "optimized dependencies
  changed. reloading" for `semver` and `zod` (the worker now imports them). It happened once
  here and the tests still passed; later starts do not show it.
- `tests/collab.spec.ts` (scaffold) is still not part of the gate.
- The gate output below comes from the final code tree. The only changes after it are this
  note, the Status line and the three evidence images.

**`npm run gate` output (full)**

```text

> bumpcheck@0.0.1 gate
> npm run lint && npm run type-check && npm run test:unit && npm run test:smoke && npm run test:api && npm run test:signed-in


> bumpcheck@0.0.1 lint
> eslint .


> bumpcheck@0.0.1 type-check
> tsc --noEmit


> bumpcheck@0.0.1 test:unit
> vitest run --passWithNoTests


 RUN  v4.1.12 /home/dustin/sync/code/personal/deep-space/bumpcheck


 Test Files  14 passed (14)
      Tests  271 passed (271)
   Start at  13:56:58
   Duration  1.26s (transform 1.53s, setup 0ms, import 4.11s, tests 378ms, environment 2ms)


> bumpcheck@0.0.1 test:smoke
> deepspace test run smoke

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 1:57:05 PM [generouted] scanned 6 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4591 ms
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

  ✓  1 tests/smoke.spec.ts:21:3 › Smoke tests › static landing loads without JS errors (728ms)
  ✓  2 tests/smoke.spec.ts:29:3 › Smoke tests › landing carries one title, one description, one canonical (369ms)
  ✓  3 tests/smoke.spec.ts:40:3 › Smoke tests › static contract: landing fires no auth request, opens no websocket (1.9s)
  ✓  4 tests/smoke.spec.ts:55:3 › Smoke tests › dynamic app boundary mounts on /home (532ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  5 tests/smoke.spec.ts:60:3 › Smoke tests › sign-in button visible when logged out (509ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  6 tests/smoke.spec.ts:66:3 › Smoke tests › unknown route shows 404 (384ms)

  6 passed (12.0s)

> bumpcheck@0.0.1 test:api
> deepspace test run api

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 1:57:20 PM [generouted] scanned 6 routes in 9 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4617 ms
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

  ✓  1 tests/api.spec.ts:4:3 › API tests › auth proxy forwards to auth worker (67ms)
  ✓  2 tests/api.spec.ts:9:3 › API tests › WebSocket endpoint exists (833ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  2 passed (8.1s)

> bumpcheck@0.0.1 test:signed-in
> deepspace test run tests/projects.spec.ts

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 1:57:32 PM [generouted] scanned 6 routes in 9 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4572 ms
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
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   1 tests/projects.spec.ts:109:1 › the projects list starts empty, a project is added, and its first scan finishes while watching (3.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   2 tests/projects.spec.ts:141:1 › adding the same repo twice is refused with its own message (1.8s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   3 tests/projects.spec.ts:155:1 › the project limit is reported, and nothing is added past it (2.0s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   4 tests/projects.spec.ts:176:1 › add requests sent at the same moment cannot get past the project limit (2.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   5 tests/projects.spec.ts:192:1 › a repo that cannot be scanned is refused with the reason, inline (1.4s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   6 tests/projects.spec.ts:214:1 › one user's projects are not in another user's list (1.8s)
  ✓   7 tests/projects.spec.ts:229:1 › an action needs a verified sign-in: no token, no project (41ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/projects.spec.ts:241:3 › the job room is locked down › a member cannot enqueue a job, and cannot read the queue (3.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/projects.spec.ts:264:3 › the job room is locked down › a signed-out visitor cannot enqueue a job either (2.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/projects.spec.ts:275:1 › a signed-in member cannot call an owner-billed integration from the browser (563ms)

  10 passed (27.8s)
```

**Supervisor note (2026-11-23).** Verified and accepted: gate green on my own run (271 unit
and engine, 6 smoke, 2 API, 10 signed-in), diff read, screenshots looked at. The page still
wears the scaffold's dark theme; ticket 07 replaces it.

**Live check after this ticket: NOT RUN.** I started `npm run live-check` once and the
session's permission system refused the command before anything ran, so nothing was spent
and the real implementations (GitHub response shapes, the Claude call, npm lookups) are still
unverified against real services. Dustin needs to run it or allow it.

The worker's three open questions (no rate limit on add-project, a refused Releases request
cached for everyone, projects stuck in "queued") are now work items in ticket 04.

**Live check, run 2026-11-24 by the supervisor (after ticket 06, so it covered the scan and
the test email together).** Passed. Spent 7.90 credits (US$0.079): Claude 19 calls $0.0426,
GitHub 16 calls $0.0234, email 1 call $0.013. The scan finished with 13 dependencies and 3
breaking. **But 7 of the 12 verdicts failed** with "response is not valid JSON", each after
two paid attempts. That is ticket 06b. The test email was accepted by the email integration
and logged as sent; it went to the Alice test account's address, which has no inbox.
