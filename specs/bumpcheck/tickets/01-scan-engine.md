# 01 — Scan engine, data model, and the gate

**Status:** done

**Who:** worker · **Changes a page:** no · **Blocked by:** None — can start immediately
**Stories:** 11, 13, 16, 18–21, 27–29, 56 (logic only; no UI) · **Decisions:** 2, 3, 5, 6, 8, 14, 17

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

## Goal

A whole scan runs in memory, against fakes, with tests proving the budget rules. Everything
later stands on this ticket's tests and its gate. Nothing here talks to the outside world.

## Build

**Config module.** One file holding every value in the spec's "Limits and caps" table. No
limit is hard-coded anywhere else, in this ticket or later ones.

**Pure modules** (no I/O, no platform imports), each with unit tests beside the source:

- **Dependency triage.** `package.json` plus latest versions in; per-dependency class out: up
  to date, patch, minor, major, not checked. Current version is the lowest the declared range
  allows. Target is the `latest` tag; prereleases ignored. A `0.x` minor counts as major. Git
  URLs, local paths, workspace links and unpublished packages are "not checked". Covers
  `dependencies` and `devDependencies` only.
- **Changelog slicer.** Changelog text plus a version range in; only in-range sections out,
  tolerating the common heading styles. Cuts at the input cap and reports that it did. For a
  release list, selects and concatenates the in-range releases.
- **Verdict contract.** The verdict schema (zod), the prompt, and the validator. No confidence
  score. The verdict key is package, current major, target major.minor.
- **Limits.** Pure decisions over counts and timestamps: may this user add a project; may this
  scan read another verdict; is the daily ceiling reached; is "scan now" cooling down; is a
  project due; is a project idle. The owner is exempt from per-user limits only.

**Interfaces, each with a fake** (real implementations come in tickets 02 and 06): package
registry, source host, judge, mailer, record store, clock. Fakes are deterministic and record
their calls so tests can assert "no judge call was made".

**Scan engine.** Receives the interfaces and a project id. Runs one step at a time and returns
resumable state, so a job can checkpoint between steps. Steps: read `package.json`; triage;
attach cached verdicts; for majors without one, fetch and slice the changelog and ask the
judge, within the per-scan and daily limits, runtime dependencies first; write results and
progress to the project row; hand off to an alert hook. The hook is an injected no-op here;
ticket 06 supplies the real alert step. No platform imports.

**Schemas** (in `src/schemas/`, registered in `src/schemas.ts`): projects, verdicts, alerts,
usage, as described under "Data" in the spec. Projects carry the user's id in the schema's
owner field and a visibility field defaulting to private. Clients cannot create, update or
delete any of the four. Verdicts are readable by every role; usage is server-only.

**Fake-services setting.** One function decides "real or fake implementations" from a single
env setting. It defaults to real. Document the setting's name in this ticket's completion note,
because later tickets rely on it. Set it only in the Playwright `webServer` command in
`tests/playwright.config.ts`. Add a unit test proving a production build has it off.

**The gate.** Add `npm run gate`: lint, type check, unit and engine tests, then the browser
tests (scaffold smoke and API suites), fastest first, stopping at the first failure.

## Tests required

- Unit: triage (range forms, `0.x`, prereleases, unscannable specs); slicer (heading styles,
  range edges, the cut); verdict validation (accepts good, rejects malformed); limits (each
  rule at its boundary, owner exemption).
- Engine, with fakes: a cache hit spends no judge call; the per-scan cap stops at 15 and
  reports the remainder; the daily ceiling stops judging but still triages; no changelog means
  no judge call; a bad judge response retries once then stores "failed"; a failed scan keeps
  old verdicts; a scan interrupted between steps resumes from its saved state.

## Out of this ticket

Real implementations, the job handler, server actions, pages, the alert step and its three
engine tests (ticket 06).

## Done means

Acceptance: every test above exists and passes; `npm run gate` exists and is green; the engine
and pure modules import nothing from `deepspace`.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, plus the
name of the fake-services setting. No screenshot needed.

## Completion

Completed 2026-11-23 on `ralph/bumpcheck`.

**Fake-services setting: `BUMPCHECK_FAKE_SERVICES`.** Exactly `"true"` selects the fakes;
anything else (or absent) selects real services. Default: real.

- Decided by `servicesMode(env)` in `src/services/mode.ts` (the one function). Worker code
  passes its `env`; the field is declared on `Env` in `worker.ts`.
- Set only in `tests/playwright.config.ts`, in the `webServer` block (`env:
  { BUMPCHECK_FAKE_SERVICES: 'true' }`).
- Forwarded from the shell to the worker by `vite.config.ts` through
  `fakeServicesWorkerVars(command, process.env)` (cloudflare plugin `config.vars`), and only when
  vite is serving. A build (`vite build`, which `deepspace deploy` runs) never forwards it.
- `src/services/mode.test.ts` proves a production build has it off: the build path forwards
  nothing even when the shell sets it, `wrangler.toml` does not declare it, and `vite.config.ts`
  reaches the worker only through that function.
- Checked by hand once (temporary route, since removed): a vite dev server started with the
  setting showed `true` in the worker's env, and one started without it showed `undefined`.
  A manual `BUMPCHECK_FAKE_SERVICES=true npx vite build` produced a `wrangler.json` whose
  `vars` do not contain it.

**What was built**

- `src/config.ts`: every limit in the spec's table, plus verdict size limits and scan pacing.
- `src/core/` (pure, no `deepspace` import): `model.ts` (shared types), `triage.ts`,
  `changelog.ts`, `verdict.ts`, `limits.ts`, each with a `*.test.ts` beside it.
- `src/services/types.ts` (registry, source host, judge, mailer, record store, clock) and
  `src/services/fakes.ts` (deterministic fakes that record their calls). `src/services/mode.ts`
  plus test.
- `src/engine/scan.ts` (resumable, step-at-a-time scan engine; alert hook injected, a no-op
  here) and `src/engine/scan.test.ts`.
- `src/schemas/{projects,verdicts,alerts,usage}-schema.ts`, registered in `src/schemas.ts`;
  `src/schemas.test.ts` checks them with the SDK's own `canRead`/`canCreate`/... and
  `lintSchemas`.
- `npm run gate` in `package.json`: lint, type check, unit + engine tests (vitest), smoke, API,
  chained with `&&` so it stops at the first failure.
- New dependency: `semver` (and `@types/semver` as a dev dependency) for range parsing.

**Platform facts checked against the installed SDK 0.44.2**: `ownerField`, `visibilityField`
(a string means "public when equal to `public`") and the `published` read rule ("owner OR
public") are as the spec says. Server-side writes (action tools, cron/job context) skip RBAC,
so "no client role may create/update/delete" doesn't block server code. `userBound` would stamp
the writer's id (the owner's context), so `userId` is `required` + `immutable`, not `userBound`.

**Judgment calls (please confirm)**

- Owner exemption: applies to projects per user and (later) test emails per user only. The
  owner is not exempt from the "scan now" cooldown, per-scan cap, daily ceiling or schedule.
- Triage: `*`, `x`, `""` and dist-tags such as `latest` are "not checked" (no lowest version).
  `npm:` aliases and tarball URLs are "not checked" too. When the `latest` tag is a
  prerelease, the target is the highest stable version; with no stable version the dependency
  is "not checked". Prerelease tags on the current version are ignored when comparing.
- Slicer: sections come out oldest first, so the cap cuts the later, smaller releases and keeps
  the x.0.0 notes.
- Engine: a cached verdict of any status (including `failed`) is attached and not judged again;
  retrying is the user's retry button. "No changelog" verdicts don't count toward the
  15-per-scan cap. If the ceiling is reached between a failed first attempt and its retry, the
  package is deferred, not stored as failed. On-demand scans skip the alert hook. Unexpected
  errors propagate to the job, which calls `markScanFailed` when it gives up. Repo problems
  (not found, no `package.json`, invalid JSON, over 150 dependencies) end the scan as failed
  with a reason. Either way the old dependency list and verdict pointers stay.
- Projects `admin` read is `published` too: the app owner reads their own projects and public
  ones, not every user's private project.
- Stretch columns (impact results, import map) are left for ticket 09.

**Left undone or unverified**

- 0.x verdict key: `verdictKey` follows decision 3 literally (current *major*), so every 0.x
  version shares a key: `pkg@0->0.5` is the same for 0.1.0 and 0.4.0 even though triage treats
  each 0.x minor as a major. Not changed because it is a "Decisions taken" item. The suggested
  fix is to use `0.<minor>` as the current part of the key for 0.x.
- A scan that fails for a permanent reason doesn't set `lastScanAt`, so `isProjectDue` stays
  true for it. Ticket 04's scheduler needs to handle this, or the engine should record the
  attempt.
- `getAiCalls` then `addAiCall` is not atomic. That is safe only because jobs in a room run
  one at a time (spec, "Platform facts").
- Duplicate check is case-sensitive (`uniqueOn` userId+repoOwner+repoName). Ticket 02 should
  store owner/repo lowercased.
- Public project rows carry `userId` (an opaque user id), and `published` returns the whole
  row. Ticket 05 must decide whether that counts as "exposing the owner's id".
- The browser tests don't yet exercise the fakes. Nothing in the worker uses `servicesMode`
  until ticket 02 wires real and fake implementations.
- The gate output below comes from the final code tree. The only change after it is this note
  and the Status line.

**`npm run gate` output (full)**

```text

> bumpcheck@0.0.1 gate
> npm run lint && npm run type-check && npm run test:unit && npm run test:smoke && npm run test:api


> bumpcheck@0.0.1 lint
> eslint .


> bumpcheck@0.0.1 type-check
> tsc --noEmit


> bumpcheck@0.0.1 test:unit
> vitest run --passWithNoTests


 RUN  v4.1.12 /home/dustin/sync/code/personal/deep-space/bumpcheck


 Test Files  9 passed (9)
      Tests  168 passed (168)
   Start at  13:09:14
   Duration  1.18s (transform 1.17s, setup 0ms, import 3.44s, tests 222ms, environment 2ms)


> bumpcheck@0.0.1 test:smoke
> deepspace test run smoke

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 1:09:20 PM [generouted] scanned 5 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4241 ms
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

  ✓  1 tests/smoke.spec.ts:21:3 › Smoke tests › static landing loads without JS errors (708ms)
  ✓  2 tests/smoke.spec.ts:29:3 › Smoke tests › landing carries one title, one description, one canonical (369ms)
  ✓  3 tests/smoke.spec.ts:40:3 › Smoke tests › static contract: landing fires no auth request, opens no websocket (1.9s)
  ✓  4 tests/smoke.spec.ts:55:3 › Smoke tests › dynamic app boundary mounts on /home (481ms)
  ✓  5 tests/smoke.spec.ts:60:3 › Smoke tests › sign-in button visible when logged out (480ms)
  ✓  6 tests/smoke.spec.ts:66:3 › Smoke tests › unknown route shows 404 (377ms)

  6 passed (11.6s)

> bumpcheck@0.0.1 test:api
> deepspace test run api

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 1:09:35 PM [generouted] scanned 5 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4190 ms
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

  ✓  1 tests/api.spec.ts:4:3 › API tests › auth proxy forwards to auth worker (103ms)
  ✓  2 tests/api.spec.ts:9:3 › API tests › WebSocket endpoint exists (883ms)

  2 passed (8.1s)
```
