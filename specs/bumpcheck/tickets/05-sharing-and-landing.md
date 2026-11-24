# 05 — Public sharing and landing

**Status:** done

**Who:** worker · **Changes a page:** yes · **Blocked by:** 04
**Stories:** 1, 2, 4, 47–50 · **Decisions:** 14

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

## Goal

A user can share a report with a link that is safe to pass around, and a visitor can see real
output before signing in.

## Build

**Visibility action:** sets a project private or public, after verifying the caller and
ownership. Private is the default.

**Read rule:** the projects schema's visibility field plus the platform's "published" read
rule lets signed-out visitors (viewer role) and other members read public projects. This is
enforced by the server, not by hiding things in the page.

**Public project view:** the project page with every action removed: no scan now, no check
this one, no reviewed, no retry, no link to settings. Share as much rendering code with the
owner's page as stays readable.

**No identity on public pages.** A public project must not expose its owner's id, name or
email. The owner field is needed for owner reads, so check what a viewer-role client actually
receives and keep identity out of it. If the platform cannot hide the owner field from
viewers, stop and report rather than work around it.

**Supervisor decision (2026-11-24, under Dustin's "use your discretion" instruction):** if the
platform cannot keep the owner field out of what a viewer receives, do not stop. Publish
through a separate collection instead: a public-report row holding only what the public page
shows (repo, dependencies, scan time and status, no user id, no alert or review state),
written and removed by server code when the project's visibility changes and refreshed when a
scan finishes. It is readable by every role; the projects collection then stays owner-only.
The public page reads only that collection. Verdicts are already public.

**"Not available" page:** a signed-out visitor or another member on a private or missing
project's link gets a clear page, not a blank screen. Do not reveal whether the project exists.

**Public switch** with the shareable link. It lives on the project settings page that ticket
06 fills in; create that page here with just this control.

**Landing page** (`src/pages/index.tsx`): one sentence on what bumpcheck does, a link to the
public example project, and sign-in with GitHub or Google. Static: no data hooks, no auth
hooks. The example project's id comes from one constant, which Dustin sets after the first
deploy; until then the link points at a local fixture project.

## Tests required

- Browser: a public project is readable signed-out and offers no actions; a private project's
  link shows "not available" signed-out and to Bob; switching back to private removes access;
  the public page's received data contains no owner id, name or email.
- Unit: the landing page renders without data or auth hooks (extend the prerender test).

## Done means

Acceptance: the behaviours above hold; the gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and
screenshots from `npx deepspace test screenshot` of the landing page, the public project view,
the "not available" page, and the settings page's public switch, saved under
`specs/bumpcheck/evidence/05/`.

## Completion

Completed 2026-11-24 on `ralph/bumpcheck`.

**Identity path taken: the separate public-report collection (the supervisor's fallback).**
The platform cannot keep the owner out of a public project row. Checked two ways against the
installed `deepspace` 0.44.2:

- Types and code: `RolePermissions` has `writableFields` but nothing for reads, a column has no
  "hidden" option, and the record room builds every row it sends with `rowToData`, which
  copies every column. The envelope also always carries `createdBy`.
- Observed (temporary probe spec, since deleted): with the old "published" rule, a signed-out
  visitor who subscribed to `projects` received Alice's public row whole: `userId` (her id),
  `createdBy` (her id again, because the add-project action writes with the caller's tools),
  `reviewedKeys`, `alertsEnabled`, `alertedKeys`, `lastOpenedAt` and the rest.

So:

- `projects` is owner-only again: `read: 'own'` for every role, and `visibilityField` is gone
  from the schema (the `visibility` column stays; it is the owner's setting, not a read rule).
  No one but the owner receives a project row, public or not.
- New collection `publicReports`: one row per public project, id = the project's id, holding
  `projectId`, `repoOwner`, `repoName`, `dependencies`, `scanStatus`, `lastScanAt` and nothing
  else. Every role reads it; no client writes it.
- What a viewer actually receives on the public page (asserted from the recorded WebSocket
  frames and `/api/` response bodies, and from a direct subscription): that one row with
  exactly those six columns, `createdBy` = the app owner's id (the server writes it with the
  owner's tools, not the caller's), and the shared verdict rows. Alice's id, email and name
  appear nowhere in it; a subscription to `projects` returns zero rows.

**How going back to private removes access.** `set-visibility` writes `visibility: 'private'`
on the project row, then calls `syncPublicReport`, which reads the project and, because it is
no longer public, deletes the `publicReports` row. That row was the only thing a non-owner
could read, so the link has nothing to show. The public page's query is live, so a page that
is already open changes to "This report is not available" without a reload (browser-tested,
for a signed-out visitor and for Bob). If the removal fails, the project row is set back to
what it was and the action answers "It is still public".

**What was built**

- Pure (no `deepspace` import): `src/core/public-report.ts`: `publicReportOf` (the one place
  that decides what a public report holds), `PUBLIC_REPORT_COLUMNS`, `readVisibility`,
  `shareLinkPath`. Tests beside it.
- Schema: `src/schemas/public-reports-schema.ts` (new, registered in `src/schemas.ts`);
  `src/schemas/projects-schema.ts` (owner-only).
- Server: `src/server/public-report.ts`: `syncPublicReport` makes the public report match the
  project (public: write it; private or gone: remove it), and reads the project once more
  after writing so a switch to private that lands mid-write still wins. Unit-tested against
  an in-memory stand-in for the record tools. Called from three places: the visibility action,
  `src/jobs.ts` when a scan or check ends, and `src/cron.ts` for scans it just marked stalled.
- Action: `src/actions/visibility.ts` (`set-visibility`), starting with `loadOwnProject`.
  `OwnProject` gained `visibility`.
- Pages:
  - `src/pages/(app)/share/[id].tsx`: the public view, at `/share/<project id>`. Not under
    `(protected)/`. Reads one `publicReports` row and the verdicts.
  - `src/pages/(app)/(protected)/projects/[id]/settings.tsx`: project settings, with only the
    public switch and the shareable link (plus a copy button). Ticket 06 adds the rest.
  - `src/pages/(app)/(protected)/projects/[id].tsx` moved to `projects/[id]/index.tsx` (same
    URL) so the two pages share a folder; it gained a "Settings" link.
  - `src/pages/index.tsx`: the landing page. `src/seo.ts`: title and description.
- Shared rendering: `src/components/report/ReportBody.tsx` (the report, moved out of the
  owner's page unchanged apart from the wording of the count line), `Panels.tsx`,
  `OwnProject.tsx` (the "find it among my own rows or say not available" loader, used by the
  project page and the settings page). `DependencyRow` takes an optional `onAction`; without
  one it renders no button element at all. The public page passes none.
- `src/components/Navigation.tsx`: a signed-out visitor is shown no nav entries (they all lead
  to the sign-in wall, and "Settings" on a read-only public page would mislead). The sign-in
  button is unchanged.
- Tests: `src/core/public-report.test.ts`, `src/server/public-report.test.ts` (new);
  `src/schemas.test.ts`, `prerender.test.ts` (extended); `tests/sharing.spec.ts` (10 browser
  tests), added to `npm run test:signed-in` before `scheduling.spec.ts`, which stays last.

**The landing page's example link: what to change after the first deploy.**
`EXAMPLE_PROJECT_ID` in `src/config.ts` (last export in the file). It is `'local-example-fixture'`
now. After the first deploy: on the live site add `dustinJ15/bumpcheck-example`, open its
Settings, switch "Public report" on, copy the last path segment of the link shown
(`https://.../share/<id>`), paste it as the constant's value, and deploy again. Until then the
live landing page's "See an example report" opens "This report is not available".

**Test-only action added: `test-publish-example`** (`src/actions/test-reset.ts`), following the
existing pattern: "Action not found" unless the fake-services setting is on. It copies the
public report of one of the caller's own projects under the example id; that copy is the local
fixture the landing link opens. `test-reset-my-projects` now also removes the caller's public
reports and that fixture.

**Red/green log** (rule 12)

| Required test | Test name | Red result |
|---|---|---|
| Browser: public project readable signed-out, no actions | `a public report is readable signed-out, offers no actions, and what the reader received names nobody` | Test first. Before the page existed: `expect(locator).toBeVisible() failed ... waiting for getByTestId('public-report')`. About the rule, by mutation on the finished code: rows render buttons without a handler: `toHaveCount(0) ... Received: 8 ... getByRole('button', { name: /scan now\|check this one\|mark as reviewed\|retry\|undo/i })`; the public page passes a handler: `Expected: "2 breaking upgrades." Received: "2 breaking upgrades to review."`; a settings link added to the public page: `Expected: 0 Received: 1 ... locator('a[href*="/settings"]')`. |
| Browser: private link shows "not available" signed-out and to Bob | `a private project's link shows "not available", signed-out and to Bob, exactly like a link to nothing` | Test first. Before the page: `waiting for getByTestId('public-report-not-available')`. By mutation: sync publishes whatever the visibility: the same message (the report was shown instead); `projects` readable by everyone: `expect(received).toEqual(expected) - Expected - 1 + Received + 119` (the visitor's `projects` subscription returned Alice's row). |
| Browser: switching back to private removes access | `switching back to private removes access, even from a page that is already open` | Test first. Before the page: `waiting for getByTestId('public-report')`. By mutation (sync does not remove the report): `waiting for getByTestId('public-report-not-available')` on the visitor's open page. |
| Browser: received data has no owner id, name or email | same test as the first row, plus `another signed-in user reads a public report the same way: no actions, no owner` | **Not seen red before the code** in this test: it could not reach its wire assertions until the page existed. The rule's red before the build is the probe described above (the owner id was received). On the finished code, by mutation (the action writes the report with the caller's tools): `expect(received).not.toContain(expected) Expected substring: not "<Alice's id>"`. |
| (ticket) only the owner can switch | `only the owner can change who sees a project` | Test first. Before the page: `waiting for getByTestId('public-report-not-available')`. By mutation (ownership check removed from the action): `expect(received).toMatchObject(expected)` on Bob's call, which succeeded. |
| Unit: landing renders without data or auth hooks | `landing page > renders without a data hook or an auth hook, and says what bumpcheck does in one sentence` (and 3 more in `prerender.test.ts`) | Test first, against the scaffold page: `the landing page has one pitch sentence: expected null not to be null`; `expected '<title>bumpcheck</title>...' not to contain 'A DeepSpace app with a static front door'`. The hook part by mutation (`useUser()` added to the page): `Error: the landing page called deepspace.useUser; it must stay static`, 4 tests red. |

Other tests, same rule:

- Test first, red seen against stubs: `publicReportOf` (`expected {} to deeply equal
  { projectId: 'project-1', …(5) }`), `PUBLIC_REPORT_COLUMNS`, `readVisibility` (`expected null
  to be 'private'`), `shareLinkPath`; `syncPublicReport` (`expected { ok: true, published:
  false } to deeply equal { ok: true, published: true }`); the schema tests (`Error: schema
  publicReports is not registered`); the landing browser test (`Error: Action not found` for
  the fixture action).
- Passed against the stub, so red by mutation only: `syncPublicReport` "writes nothing for a
  private project", "removes ... gone back to private", "removes ... no longer exists" (the
  stub wrote nothing). Mutation "no second read after writing": `takes the report back if the
  owner switched to private while it was being written` red (`fresh: expected { ok: true,
  published: true } ...`). Mutation "`publicReportOf` also copies `userId`": 2 tests red.
- `a public report follows its project` (browser): written before the code, first run after
  it. Red by mutation (the job does not sync): `Expected: "safe" Received: "not-read"`.
- Mutation runs on the finished code, each restored: 12, all red. Unit: no re-read after
  writing; landing calls a hook; public report carries `userId`. Browser: ownership check
  removed; `projects` readable by all; sync ignores visibility; sync never removes; report
  written as the caller; public page passes a handler; rows always render buttons; settings
  link on the public page; job does not sync.

**Tests changed**

- `src/schemas.test.ts`, `projects`: "shows a public project to other members and signed-out
  visitors" is replaced by "is owner-only even when public". That is the rule changing (the
  supervisor's decision in this ticket), not a weakened test. The `visibilityField`
  expectation went with it.
- `tests/sharing.spec.ts`, my own first draft: two assertions searched the whole wire text for
  `"userId"` and `"repoName"`. They were wrong: the record room sends every client the schema
  list, which contains those column names. They now look at the records received.

**Evidence** (`specs/bumpcheck/evidence/05/`)

Taken with `npx deepspace test screenshot` (signed-out pages). The command is run from inside
`tests/sharing.spec.ts` when `BUMPCHECK_EVIDENCE` is set, because the pages need records that
exist only while the spec runs; a normal gate run does not take them:

- `landing.png`, `landing-narrow.png` (380 px): the landing page.
- `public-report.png` (whole page), `public-report-narrow.png` (380 px): the public view.
- `not-available.png`: a private project's link, signed out.

The browser test's own captures (signed in as Alice; the screenshot command cannot sign in):

- `settings-private.png`, `settings-public.png`, `settings-public-narrow.png`: the settings
  page with the switch off, then on with the shareable link.

**Left undone, unverified, or open**

- **`createdBy` on public rows is the app owner's user id.** The platform sends it with every
  row and it cannot be left out. It is the same value on every public report and every
  verdict, so it does not say whose project a report is. But when the app owner shares his
  own project (the landing example will be one), that value is his id. The tests use Alice,
  who is not the app owner, so they do not cover that case.
- **Ticket 06's delete must remove the public report** (call `syncPublicReport` after
  deleting the project row, or `removeReport`). Otherwise a deleted public project's report
  stays readable at its link. Nothing enforces this yet.
- **The failure path of `set-visibility`** (the report cannot be written or removed, so the
  row is set back) has no automated test: the local record room cannot be made to fail. The
  code review found that path restoring the wrong value when a request repeated the current
  setting; it now restores the stored value, but that fix is untested too.
- **The public report is a copy, written when a scan or check ends, when visibility changes,
  and when the hourly task marks a scan stalled.** It does not show live scan progress. A
  project made public mid-scan shows "Scanning" with no detail until the job ends. If
  `scan-now` or a check fails to enqueue, the status written to the project row is not copied
  until the next sync.
- The public page subscribes to the whole `verdicts` collection, like the owner's page.
- Not driven by a test: the public page's loading and error panels, its wording for a failed
  scan, the settings page's error panel, and the "Copy link" button (clipboard).
- `spec.md` still says projects are read through the "published" rule ("Platform facts" and
  "Data"). Not edited here.
- The real services were not called. The live check was not run.
- The gate output below is from the final code tree. The only changes after it are this note,
  the Status line and the evidence images.

**Noticed outside this ticket** (not changed)

- `add-project` writes the project row with the caller's tools, so a project row's
  `createdBy` is the user's id. Harmless now that only the owner reads the row.
- The `users` collection's roster setting is the platform default (`public-identity`): a
  client that asks for the user list may get every user's id and name. The public page does
  not ask and received none, and it is not tied to a project, but it is identity a non-owner
  might read. Not verified what a signed-out viewer gets if it asks.
- The scaffold `/settings` page ("Your account") is still in the nav for signed-in users,
  next to the new per-project settings page. Ticket 07 may want to rename or drop it.
- From the code review, already known from ticket 03: two simultaneous add requests from a
  user one below the limit are both refused.

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


 Test Files  23 passed (23)
      Tests  460 passed (460)
   Start at  03:46:35
   Duration  1.89s (transform 2.44s, setup 0ms, import 7.87s, tests 873ms, environment 5ms)


> bumpcheck@0.0.1 test:smoke
> deepspace test run smoke

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:46:43 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4799 ms
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

  ✓  1 tests/smoke.spec.ts:21:3 › Smoke tests › static landing loads without JS errors (733ms)
  ✓  2 tests/smoke.spec.ts:29:3 › Smoke tests › landing carries one title, one description, one canonical (394ms)
  ✓  3 tests/smoke.spec.ts:40:3 › Smoke tests › static contract: landing fires no auth request, opens no websocket (1.9s)
  ✓  4 tests/smoke.spec.ts:55:3 › Smoke tests › dynamic app boundary mounts on /home (1.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  5 tests/smoke.spec.ts:60:3 › Smoke tests › sign-in button visible when logged out (1.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  6 tests/smoke.spec.ts:66:3 › Smoke tests › unknown route shows 404 (409ms)

  6 passed (13.2s)

> bumpcheck@0.0.1 test:api
> deepspace test run api

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:46:59 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4784 ms
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

  ✓  1 tests/api.spec.ts:4:3 › API tests › auth proxy forwards to auth worker (224ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  2 tests/api.spec.ts:9:3 › API tests › WebSocket endpoint exists (905ms)

  2 passed (8.6s)

> bumpcheck@0.0.1 test:signed-in
> deepspace test run tests/projects.spec.ts && deepspace test run tests/project-page.spec.ts && deepspace test run tests/sharing.spec.ts && deepspace test run tests/scheduling.spec.ts

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:47:11 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4796 ms
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
  ✓   1 tests/projects.spec.ts:73:1 › the projects list starts empty, a project is added, and its first scan finishes while watching (4.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   2 tests/projects.spec.ts:105:1 › adding the same repo twice is refused with its own message (2.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   3 tests/projects.spec.ts:119:1 › the project limit is reported, and nothing is added past it (3.3s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   4 tests/projects.spec.ts:140:1 › add requests sent at the same moment cannot get past the project limit (3.6s)
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
[WebServer] [action] "add-project" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
  ✓   6 tests/projects.spec.ts:178:1 › one user's projects are not in another user's list (3.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   7 tests/projects.spec.ts:193:1 › an action needs a verified sign-in: no token, no project (36ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/projects.spec.ts:205:3 › the job room is locked down › a member cannot enqueue a job, and cannot read the queue (5.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/projects.spec.ts:228:3 › the job room is locked down › a signed-out visitor cannot enqueue a job either (2.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/projects.spec.ts:239:1 › a signed-in member cannot call an owner-billed integration from the browser (581ms)

  10 passed (35.6s)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:47:50 AM [generouted] scanned 9 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4955 ms
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   1 tests/project-page.spec.ts:76:1 › the report sorts every dependency into its group and section, each in its own state (3.7s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   2 tests/project-page.spec.ts:167:1 › a verdict is marked as reviewed, moves to the collapsed section, and undo brings it back (4.2s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   3 tests/project-page.spec.ts:207:1 › the server refuses to review a verdict that is not in the project, or a failed one (3.9s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   4 tests/project-page.spec.ts:226:1 › a change made in one tab appears in a second tab (3.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   5 tests/project-page.spec.ts:251:1 › the projects list shows each project's count of unreviewed breaking upgrades (3.3s)
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   6 tests/project-page.spec.ts:277:1 › Bob cannot see Alice's private project by URL, and cannot act on it (7.9s)
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
  ✓   7 tests/project-page.spec.ts:324:1 › "check this one" reads only that dependency, and progress shows while it runs (6.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/project-page.spec.ts:372:1 › a second request while a check is running is refused: one scan at a time (5.1s)
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
  ✓   9 tests/project-page.spec.ts:389:1 › a verdict read from a later version is not shown to a project on an older one, until its own check reads the wider range (9.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  10 tests/project-page.spec.ts:420:1 › a check that cannot finish says so, keeps the report, and can be asked again (8.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  11 tests/project-page.spec.ts:447:1 › a failed verdict has a retry button, and retrying judges that verdict again (3.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  12 tests/project-page.spec.ts:484:1 › scan progress is shown live while the first scan runs (6.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  13 tests/project-page.spec.ts:505:1 › a project with no dependencies shows an empty state, not an empty page (2.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  14 tests/project-page.spec.ts:516:1 › opening a project records that it was opened (2.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  14 passed (1.3m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:49:13 AM [generouted] scanned 9 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4910 ms
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
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   1 tests/sharing.spec.ts:198:1 › a project is private until its owner switches it to public on the settings page, which then shows the link (6.8s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   2 tests/sharing.spec.ts:246:1 › a public report is readable signed-out, offers no actions, and what the reader received names nobody (10.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
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
  ✓   3 tests/sharing.spec.ts:340:1 › another signed-in user reads a public report the same way: no actions, no owner (12.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
  ✓   4 tests/sharing.spec.ts:377:1 › a private project's link shows "not available", signed-out and to Bob, exactly like a link to nothing (15.7s)
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   5 tests/sharing.spec.ts:433:1 › switching back to private removes access, even from a page that is already open (13.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
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
  ✓   6 tests/sharing.spec.ts:472:1 › only the owner can change who sees a project (16.2s)
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   7 tests/sharing.spec.ts:541:1 › a public report follows its project: a check that finishes shows up for the reader (5.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-publish-example" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   8 tests/sharing.spec.ts:560:1 › the landing page says what bumpcheck does, links to the example report, and offers sign-in (3.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/sharing.spec.ts:598:1 › the test-only example fixture is not an open door (13ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
  ✓  10 tests/sharing.spec.ts:603:1 › nothing public is left behind (4.7s)
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  10 passed (1.6m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:50:53 AM [generouted] scanned 9 routes in 9 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4901 ms
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
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 7ms
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 23ms
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 5ms
  ✓   1 tests/scheduling.spec.ts:132:1 › the scheduled task, triggered directly, re-scans a due project and leaves one that is not due (8.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 6ms
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 24ms
  ✓   2 tests/scheduling.spec.ts:163:1 › an idle project is not scanned until its owner opens it again (7.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   3 tests/scheduling.spec.ts:194:1 › scan now inside the cooldown shows a notice with the time it returns; after the cooldown it scans (4.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   4 tests/scheduling.spec.ts:236:1 › scan now is refused while a scan is running: one scan at a time (6.9s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 115ms
  ✓   5 tests/scheduling.spec.ts:260:1 › a scan that stops at its limit says so, and a later scan reads the rest (4.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-use-up-daily-ai-limit" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 23ms
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   6 tests/scheduling.spec.ts:293:1 › the app's daily AI limit stops the judge on every path, and the page says it is a limit (5.6s)
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
  ✓   7 tests/scheduling.spec.ts:339:1 › a failed scan shows its reason and a retry, and the retry is under the cooldown (15.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/scheduling.spec.ts:377:1 › an upgrade whose release notes GitHub refused is shown as not read this time, with no verdict (2.4s)
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
  ✓   9 tests/scheduling.spec.ts:393:1 › add-project attempts are capped per user per day, and the refusal says when the cap resets (11.2s)
  ✓  10 tests/scheduling.spec.ts:426:3 › the cron room is locked down › a member cannot trigger, pause or resume the scheduled task (4.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  11 tests/scheduling.spec.ts:433:3 › the cron room is locked down › a signed-out visitor cannot either (3.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  12 tests/scheduling.spec.ts:439:3 › the cron room is locked down › the test-only trigger is not an open door: it needs a sign-in (31ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  13 tests/scheduling.spec.ts:445:1 › nothing is left behind for the next run of the scheduled task (2.4s)

  13 passed (1.4m)
```
