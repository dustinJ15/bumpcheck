# 03 — Project page with triage

**Status:** done

**Who:** worker · **Changes a page:** yes · **Blocked by:** 02
**Stories:** 11–23, 30–36 · **Decisions:** 2, 5, 6, 13, 14

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

## Goal

The report is readable and finishable: every dependency is sorted and explained, and the user
can clear verdicts out of the way.

## Build

**Project page** (protected, owner's view):

- Runtime and dev dependencies as separate groups. Within each: breaking, unclear, safe major,
  minor or patch ("not read", never "safe"), up to date, not checked.
- Each outdated dependency shows current and available version, in monospace.
- A breaking verdict lists each change: what changed and what to do. Every verdict links to
  the changelog it was read from.
- Distinct states: "unclear"; "no changelog found" with a link to the package's releases page;
  "not checked" for unscannable specs; a notice when the changelog was cut; a failed verdict
  with a retry button.
- Live scan progress, read from the project row (members cannot watch the job room).
- Reviewed verdicts move to a collapsed section; undo brings them back. A newer verdict for
  the same package has a new key and so appears as new.
- Loading, empty and error states.

**Server actions**, each verifying the caller and ownership before anything else:

- Check one dependency: enqueues an on-demand scan job for one minor or patch upgrade, within
  the per-scan and daily limits.
- Retry a failed verdict.
- Mark a verdict reviewed, and undo it.
- Record that the project was opened (resets the idle timer).

**Projects list:** add each project's count of unreviewed breaking upgrades.

## Tests required

- Unit: the grouping and sorting function; the unreviewed-breaking count.
- Engine: an on-demand read judges only the requested dependency and respects both limits.
- Browser: mark reviewed and undo; a change made in one tab appears in a second tab; Bob
  cannot see Alice's private project by URL.

## Out of this ticket

Scan now, cooldown and limit notices (04); public view (05); settings (06).

## Done means

Acceptance: every state listed above is reachable against the fakes and renders; the gate is
green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and
screenshots from `npx deepspace test screenshot` of the project page (mid-scan, finished with
a breaking verdict expanded, and with the reviewed section open) and the projects list with
counts, saved under `specs/bumpcheck/evidence/03/`.

## Completion

Completed 2026-11-23 on `ralph/bumpcheck`.

**What was built**

- Pure, unit-tested rules (no `deepspace` import):
  - `src/core/report.ts`: the state of each dependency (`rowState`), its section
    (`sectionOf`), the grouping and sorting and the reviewed split (`buildReport`), the
    unreviewed-breaking count (`countUnreviewedBreaking`), and the reviewed-key helpers.
  - `src/core/requests.ts`: what a user may ask for. `checkOnDemandRequest` ("check this one"
    and retry) and `checkReviewRequest`.
  - `src/core/verdict-cover.ts`: `verdictCovers`, the supervisor's decision A (below).
- Engine: `src/engine/scan.ts` has a short on-demand path. `startScan(id, { onDemand: true })`
  starts at a new `read-request` step, which reads the requested package names from the
  project row, then goes through the same `judge` step as a full scan, then a `write` that
  leaves the scan times and report alone. `src/engine/scan-job.ts` records a failed on-demand
  job with `markCheckFailed` instead of `markScanFailed`.
- Data: one new column on `projects`, `checkRequests` (JSON list of package names). It is
  where the action records the requested dependency, because the job payload is still only
  `{ projectId, onDemand }`.
- Server actions (`src/actions/`), each starting with `loadOwnProject` in `own-project.ts`
  (loads the row, compares its `userId` with the verified caller, and answers "Project not
  found." for a missing project and for someone else's alike): `check-dependency` and
  `retry-verdict` (`on-demand.ts`), `mark-reviewed`, `undo-reviewed` and `record-opened`
  (`review.ts`).
- Pages: `src/pages/(app)/(protected)/projects/[id].tsx` (the project page) with
  `src/components/report/DependencyRow.tsx` and `ScanStatus.tsx`; `src/lib/records.ts`
  (row types, `useVerdicts`) and `src/lib/json.ts`. The projects list moved from
  `projects.tsx` to `projects/index.tsx` (same URL) so the two pages sit in one folder; it
  now links each project and shows its count.
- Fake world (`src/services/fake-world.ts`): the demo repo gained `big` (changelog cut at the
  cap), `garbled` (failed verdict) and `lint` (patch); new repos `slow` (judge answers after
  1.5 s, so a scan can be watched), `empty`, `older` (an older `colors` than demo) and
  `offline` (a minor upgrade whose changelog the fake GitHub refuses). `colors` answers a
  check after 2 s with a safe verdict. No test-only branch was added to production code.
- Tests: `src/core/report.test.ts`, `requests.test.ts`, `verdict-cover.test.ts`,
  `src/engine/on-demand.test.ts`, more cases in `src/engine/tick.test.ts`,
  `tests/project-page.spec.ts` (14 browser tests), shared helpers in `tests/helpers/app.ts`.
  `npm run test:signed-in` now runs both signed-in specs, so the gate includes the new one.

**How each required state is reached against the fakes** (all in `bumpcheck-fake/demo`
unless said): breaking `router`, `big`; unclear `types`; safe major `test-runner`; no
changelog `dates`; changelog cut `big`; failed verdict `garbled`; minor or patch, not read
`colors`, `lint`; up to date `tiny`; not checked `local-thing`; mid-scan `bumpcheck-fake/slow`
(and any check of `colors`); empty `bumpcheck-fake/empty`; failed check
`bumpcheck-fake/offline`; not available: any project id that is not the caller's.

**How "check one" and "retry" stay inside the limits**

1. The action checks ownership, then `checkOnDemandRequest`: the project's last scan must be
   finished and no scan running; "check" only for a minor or patch upgrade with no covering
   verdict; "retry" only for a failed verdict.
2. It writes `checkRequests: [name]` and `scanStatus: 'queued'` on the row and enqueues
   `{ projectId, onDemand: true }`. No judge call is made by the action.
3. The job's `read-request` step queues only the named dependencies, and attaches a usable
   cached verdict for free. Each queued one goes through `judgeNext`, the same function a
   full scan uses, which checks `mayJudgeAnother` (15 per scan) and `isDailyCeilingReached`
   (150 a day) before every AI call and again before the retry attempt. Past a limit the
   dependency is marked `deferredBy` and the row says why.
4. An on-demand scan never alerts, and never changes `lastScanAt`, `nextDueAt` or the scan
   report.

**Decisions taken with the supervisor during this ticket (2026-11-23)**

- **A: when a cached minor or patch verdict applies.** The key is unchanged (decision 3). A
  verdict for a same-major upgrade covers a dependency only when its `fromVersion` is at or
  below the dependency's current version; otherwise the dependency stays "not read" and its
  own check reads the wider range and replaces the stored verdict. Majors share as before.
  One function, `verdictCovers`, used by the scan's attach step, the on-demand step, the
  action's "already read" check and the page's report.
- **A failed on-demand check does not fail the project.** It stays "done" with its report,
  the reason is stored in `scanError`, the page shows "The last check did not finish", and
  the check can be asked again. A failed full scan is recorded as before.

**Judgment calls (please confirm)**

- Section placement. The spec names six sections. Failed, no-changelog and not-yet-read
  majors are listed under "Unclear", each with its own badge. A checked minor or patch that
  is safe stays under "Minor or patch"; one that is breaking moves to "Breaking" and counts.
- Check and retry are refused unless the project's `scanStatus` is `done`: not while a scan
  is queued or running (one at a time), and not on top of a failed or missing full scan.
- A failed verdict cannot be marked reviewed (a retry keeps its key, so a reviewed failure
  would hide the real verdict). `mark-reviewed` accepts only a key attached to one of the
  project's dependencies.
- The page finds the project among the caller's own rows (`where: { userId }`), so another
  user's project id shows "This project is not available". The record room refuses the row
  on its side too. Someone else's *public* project also shows "not available" here; the
  public view is ticket 05.
- `useVerdicts` subscribes to the whole `verdicts` collection, because record queries are
  equality-only and the report needs all of a project's verdicts to sort. Fine at this
  app's size; it would need a different approach at scale.
- On-demand scans show as "Queued" / "Scanning" in the status line, like any scan.
- Test-only action `test-reset-fake-world` (refuses unless the fake setting is on): deletes
  the fake packages' verdicts and today's usage row. Without it cached verdicts carried over
  between tests, and repeated gate runs would reach the 150-a-day ceiling locally.
- The browser specs now save their captures to `test-results/captures/` (git-ignored), so
  collecting evidence does not need the `.deepspace/` folder. While looking for the captures
  I ran one `find` that listed PNG file names under `.deepspace/test-results/`; I opened
  nothing there.

**Red/green log** (rule 12)

Rule 12 arrived partway through. What was written before it, and how its red was obtained,
is said on each line. "Stub" means the functions existed with a constant return value.

| Required test | Test name | Red result |
|---|---|---|
| Unit: grouping and sorting | `buildReport > orders the sections: breaking, unclear, safe major, minor or patch, up to date, not checked` (and 22 more in `report.test.ts`) | Code was written first. Red against a stub: `Error: no group runtime`; `keeps runtime and dev ... in separate groups`: `expected [] to deeply equal [ 'runtime', 'dev' ]`. 23 of 25 failed. |
| Unit: unreviewed-breaking count | `countUnreviewedBreaking > counts breaking verdicts across runtime and dev`, `> does not count the reviewed ones` | Same stub run: `expected +0 to be 3`, `expected +0 to be 2`. |
| Engine: on-demand judges only the requested dependency | `an on-demand scan ("check this one") > judges only the requested dependency and reads nothing from the repo` | Engine change was written first. Red by restoring `scan.ts` from the previous commit: `expected [] to deeply equal [ 'zod' ]`. All 12 tests in the file failed. |
| Engine: respects both limits | `> makes no AI call when the daily ceiling is reached, and says so on the dependency`; `> stops at the per-scan cap even if more were requested` | Same run: `expected undefined to be 'daily-ceiling'`; `expected [] to have a length of 15 but got +0`. |
| Browser: mark reviewed and undo | `a verdict is marked as reviewed, moves to the collapsed section, and undo brings it back` | Test first. Before the page existed: `expect(locator).toHaveAttribute ... Expected: "done" ... element(s) not found, waiting for getByTestId('project-page')`. |
| Browser: change in one tab appears in a second | `a change made in one tab appears in a second tab` | Test first. Same failure, `waiting for getByTestId('project-page')`. |
| Browser: Bob cannot see Alice's project | `Bob cannot see Alice's private project by URL, and cannot act on it` | Test first. Before the page existed it failed on Alice's own page not loading (same message), which says little, so I also removed the ownership check in `loadOwnProject` on the finished code: `Error: mark-reviewed ... toMatchObject` (Bob's call succeeded). Restored. |

Other tests, same rule:

- Test first, red seen: `src/core/requests.test.ts` (19 of 22 failed against a stub, e.g.
  `expected { ok: true } to match object { ok: false, refusal: 'scan-running' }`); the
  fake-world cases in `tick.test.ts` (`expected [...] to have a length of 10 but got 7`);
  `verdictCovers` and its uses (7 failed, e.g. `expected 'zod@3->3.23' to be undefined`);
  the failed-check rule (`expected { next: 'finish', … } to match object { outcome:
  'failed', … }`); the up-to-date guard (`expected [ 'current' ] to deeply equal []`); all
  14 browser tests except as noted next.
- `a verdict read from a later version is not shown ...` (browser): the rule already existed
  when this test was written, so its red came from switching `verdictCovers` off for one
  run: `Expected: "not-read" Received: "safe"`.
- Mutation runs I did on the finished code, each restored afterwards. Unit (15, all red):
  section order swapped; count includes reviewed; failed verdict reviewable; minor or patch
  shown as safe; name order reversed; check allows majors; one-at-a-time removed; retry of a
  non-failed verdict allowed; check of an already-read upgrade allowed; on-demand judges
  everything; per-scan cap removed; daily ceiling removed; retry does not re-judge;
  on-demand runs a full scan; AI calls not counted. Browser (one run, 5 tests red):
  ownership check removed, and the request checks removed from both actions.
- Tests changed, none weakened: `tick.test.ts` and `scan-job.test.ts` expectations that
  counted the demo repo's dependencies (7 to 10, 8 outbound calls to 11) and
  `projects.spec.ts` ("7 dependencies" to "10 dependencies") follow the larger fixture. The
  first version of my own test "an on-demand job that cannot finish" asserted `failed`; it
  was rewritten when the failed-check rule changed. `requests.test.ts` inputs changed from
  `verdictStatus` to `verdict` for decision A, with the same expectations.

**Evidence** (`specs/bumpcheck/evidence/03/`)

All are the browser tests' own captures, copied from `test-results/captures/` after the gate
run below. `npx deepspace test screenshot` cannot sign in (ticket 02 found it reaches only
the "Sign in to continue" panel); I did not run it again for this ticket.

- `project-mid-scan.png`: project page during a first scan (`bumpcheck-fake/slow`).
- `project-mid-check.png`: project page during "check this one", report in place.
- `project-finished-breaking-expanded.png`: finished, both breaking verdicts expanded.
- `project-reviewed-open.png`: the reviewed section open, with undo.
- `projects-with-counts.png`: projects list with the counts.
- `project-narrow.png`: the project page at 380 px wide.
- `project-not-available.png`: what Bob sees at Alice's project URL.
- `project-check-failed.png`: the notice after a check that could not finish.

**Left undone, unverified, or open**

- **Retry succeeding is not shown in a browser test.** The fake judge is stateless, so
  `garbled` fails every time; the browser test proves the retry ran (the verdict's time
  changes) and judged nothing else. Retry replacing a failed verdict with a good one is
  covered by the engine test only.
- **Two on-demand requests sent at the same instant.** The status check and the write are
  not atomic. Both can be accepted; the job room runs them one at a time, the first reads
  whichever name was written last, the second finds no request. Nothing extra is spent, but
  one request is dropped although its action answered success. In normal use the second
  request is refused (browser-tested).
- **`mark-reviewed` / `undo-reviewed` are read-modify-write** on `reviewedKeys`; two at the
  same instant can lose one. `reviewedKeys` is never pruned.
- **A stale pointer.** If a retry from a project on a later version replaces a failed
  minor verdict, a project on an earlier version keeps its pointer but the page (correctly)
  shows it as "not read" until that project checks it.
- **Stalled jobs** (ticket 04) also cover on-demand jobs: a project left "queued" refuses
  checks until that lands.
- Loading and error states of the page are written but not driven by a browser test (no
  way to make the local record room fail on demand), and neither is the panel that shows
  an action's refusal (the refusals themselves are tested by calling the actions).
  Not-available, empty, waiting and failed-check are tested.
- The real services were not called. The live check was not run.
- The gate output below is from the final code tree. The only changes after it are this
  note, the Status line and the evidence images.

**Noticed outside this ticket** (from the code review; not changed)

- Releases refusal cached as "no changelog found": already in ticket 04.
- `add-project`: two requests at once from a user one below the limit are both refused
  (each recounts, sees itself over, and removes its own row).
- `claude-judge.ts`: a 1,500-token output cap may cut a large breaking verdict's JSON; it
  would fail validation twice and be stored as failed. Unverified until the live check.
- `judgeNext`: if the record write after a successful judge call throws, the retried step
  pays for the same verdict again.
- `triage()` in `src/core/triage.ts` (used only by tests) reads `published[name]` without an
  own-property check.

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


 Test Files  18 passed (18)
      Tests  350 passed (350)
   Start at  14:36:10
   Duration  1.46s (transform 1.82s, setup 0ms, import 4.96s, tests 638ms, environment 3ms)


> bumpcheck@0.0.1 test:smoke
> deepspace test run smoke

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 2:36:18 PM [generouted] scanned 7 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4714 ms
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

  ✓  1 tests/smoke.spec.ts:21:3 › Smoke tests › static landing loads without JS errors (813ms)
  ✓  2 tests/smoke.spec.ts:29:3 › Smoke tests › landing carries one title, one description, one canonical (392ms)
  ✓  3 tests/smoke.spec.ts:40:3 › Smoke tests › static contract: landing fires no auth request, opens no websocket (1.9s)
  ✓  4 tests/smoke.spec.ts:55:3 › Smoke tests › dynamic app boundary mounts on /home (476ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  5 tests/smoke.spec.ts:60:3 › Smoke tests › sign-in button visible when logged out (492ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  6 tests/smoke.spec.ts:66:3 › Smoke tests › unknown route shows 404 (388ms)

  6 passed (11.8s)

> bumpcheck@0.0.1 test:api
> deepspace test run api

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 2:36:33 PM [generouted] scanned 7 routes in 9 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4715 ms
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  2 tests/api.spec.ts:9:3 › API tests › WebSocket endpoint exists (835ms)

  2 passed (8.2s)

> bumpcheck@0.0.1 test:signed-in
> deepspace test run tests/projects.spec.ts && deepspace test run tests/project-page.spec.ts

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 2:36:44 PM [generouted] scanned 7 routes in 9 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4683 ms
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   1 tests/projects.spec.ts:73:1 › the projects list starts empty, a project is added, and its first scan finishes while watching (4.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   2 tests/projects.spec.ts:105:1 › adding the same repo twice is refused with its own message (1.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   3 tests/projects.spec.ts:119:1 › the project limit is reported, and nothing is added past it (2.3s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   4 tests/projects.spec.ts:140:1 › add requests sent at the same moment cannot get past the project limit (3.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   5 tests/projects.spec.ts:156:1 › a repo that cannot be scanned is refused with the reason, inline (1.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
  ✓   6 tests/projects.spec.ts:178:1 › one user's projects are not in another user's list (2.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   7 tests/projects.spec.ts:193:1 › an action needs a verified sign-in: no token, no project (23ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/projects.spec.ts:205:3 › the job room is locked down › a member cannot enqueue a job, and cannot read the queue (4.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/projects.spec.ts:228:3 › the job room is locked down › a signed-out visitor cannot enqueue a job either (2.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/projects.spec.ts:239:1 › a signed-in member cannot call an owner-billed integration from the browser (477ms)

  10 passed (31.0s)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 2:37:19 PM [generouted] scanned 7 routes in 9 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4811 ms
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
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   1 tests/project-page.spec.ts:76:1 › the report sorts every dependency into its group and section, each in its own state (3.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   2 tests/project-page.spec.ts:167:1 › a verdict is marked as reviewed, moves to the collapsed section, and undo brings it back (3.3s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   3 tests/project-page.spec.ts:207:1 › the server refuses to review a verdict that is not in the project, or a failed one (3.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   4 tests/project-page.spec.ts:226:1 › a change made in one tab appears in a second tab (3.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   5 tests/project-page.spec.ts:251:1 › the projects list shows each project's count of unreviewed breaking upgrades (2.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "undo-reviewed" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "check-dependency" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "retry-verdict" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "record-opened" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "mark-reviewed" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   6 tests/project-page.spec.ts:277:1 › Bob cannot see Alice's private project by URL, and cannot act on it (6.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   7 tests/project-page.spec.ts:324:1 › "check this one" reads only that dependency, and progress shows while it runs (5.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/project-page.spec.ts:372:1 › a second request while a check is running is refused: one scan at a time (4.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   9 tests/project-page.spec.ts:389:1 › a verdict read from a later version is not shown to a project on an older one, until its own check reads the wider range (9.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  10 tests/project-page.spec.ts:420:1 › a check that cannot finish says so, keeps the report, and can be asked again (7.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  11 tests/project-page.spec.ts:447:1 › a failed verdict has a retry button, and retrying judges that verdict again (2.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  12 tests/project-page.spec.ts:484:1 › scan progress is shown live while the first scan runs (6.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  13 tests/project-page.spec.ts:505:1 › a project with no dependencies shows an empty state, not an empty page (1.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  14 tests/project-page.spec.ts:516:1 › opening a project records that it was opened (1.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  14 passed (1.2m)
```
