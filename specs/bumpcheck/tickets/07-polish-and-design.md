# 07 — Polish and design

**Status:** done

**Who:** worker · **Changes a page:** yes · **Blocked by:** 06
**Stories:** all screens; 56 · **Ledger:** B.28, B.31

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

## Goal

The app looks like one deliberate product, every screen handles its edge states, and the repo
is ready for a reader. No new behaviour.

## Build

**Visual identity** across the five screens (landing, projects list, project page, project
settings, public project view): light, dense, developer-tool style, one accent colour,
monospace for versions and package names. The scaffold's themes are placeholders; replace
them with one theme and remove theme switching.

**States:** each screen has designed empty, loading and error states. Check each one, and fix
any that fall back to scaffold defaults or a blank area.

**Narrow window:** no screen breaks or scrolls sideways at a 390-pixel-wide viewport. This is
"does not break", not a mobile-specific layout.

**Scaffold leftovers:** remove or hide what bumpcheck does not use: the api-status page and
its tests, the scaffold home page, unused nav entries, AI chat routes and tools, unused UI
components, placeholder SEO text. Remove only what nothing imports, and keep the scaffold's
layout. If removing something breaks the gate in a way that is not obvious, leave it and note
it.

**Copy pass:** every user-facing message is specific and plain. Limit and failure notices say
what happened and what the user can do.

**README:** what bumpcheck is, how to run it locally (`nvm use`, install, dev server, the
gate), where the limits live, and that the live check and deploys are run by hand by Dustin.
No licence file.

**Writeup draft** (`WRITEUP.md`): what was built; which integrations were used and why
(GitHub, Claude, email) and why each other one was left out; the main tradeoff (shared verdict
cache and semver-gated AI under a $5 budget); what the agent did. Leave "What Dustin verified
himself" as an empty heading for Dustin. State only what is true of the code as it stands.

**Added by the supervisor from ticket 05:**

- Check what a signed-out visitor and another signed-in member receive if they ask the record
  room for the `users` collection (the scaffold leaves it on the platform default). Nobody but
  the user themself and the app owner should be able to read another user's name or email. If
  the schema can restrict it without breaking sign-in or the nav's own-identity chip, restrict
  it and add a browser test; if it cannot, say exactly what is exposed in the report.
- The scaffold's "Your account" `/settings` page still sits in the nav beside the per-project
  settings. Rename or regroup so the two are not confused.

## Tests required

No new behaviour, so no new rules to protect. All existing tests must still pass. Update
selectors only where markup changed. Do not weaken or delete a test to make it pass.

## Done means

Acceptance: the items above; the gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and
screenshots from `npx deepspace test screenshot` of all five screens at the default viewport
and at `--viewport=390x844`, plus one empty state and one error state, saved under
`specs/bumpcheck/evidence/07/`. The supervisor looks at every one.

## Completion

Completed 2026-11-24 on `ralph/bumpcheck`.

**Visual identity** (`src/styles.css`, one `@theme` block)
- One light theme: ink `#1f2328` on a `#f3f4f6` page with white panels, hairline `#d9dde3`
  borders, radius 6px, 14px body text. One accent, blue `#0b57d0` (`--color-primary`): links,
  primary buttons, focus rings, progress, the mark. Verdict and status colours (breaking red,
  unclear amber, safe green) are tints used only to label state. The values are the alert email's
  own (`COLOR` in `src/core/alert-email.ts`, unchanged), so app and email match.
- Monospace for package names, versions, repo names and the wordmark (`--font-mono`).
- New `src/components/Wordmark.tsx` (an arrow mark in the accent plus `bumpcheck` in mono, no
  hooks) used in the nav, the landing page and the 404; the same mark is `public/favicon.svg`.
- Badges are soft (tinted text, hairline border, small radius); buttons and inputs a size denser;
  notices and error panels are white with a coloured left edge instead of a muddy tint.
- Nav: white bar aligned to the content width, the mark links to `/projects` (signed in) or `/`
  (signed out). With one nav entry left the mobile hamburger menu was removed; the link stays in
  the bar at every width.
- Landing rebuilt (still static, no data or auth hooks): header with the mark, the one-sentence
  pitch, the example-report button, a three-row "How a report reads (an illustration)", the four
  steps, and the sign-in links.
- Unsubscribe pages (`src/core/unsubscribe-page.ts`): same palette, the mark inline as SVG, accent
  button, light only (the dark-mode block was removed, as the app has none). Still loads nothing.
- Theme switching removed: `src/themes.ts`, `src/themes.css`, `data-theme` and the per-theme
  first-paint lines in `index.html` are gone; `index.html` paints `#f3f4f6` first.

**States.** Every screen already had loading, empty, error and not-available states from tickets
02 to 06; none fell back to a scaffold default or a blank area. They now share the new look. The
404 page got the mark and plain copy ("There is no page at this address.", link to `/`).

**Narrow window.** `tests/evidence.spec.ts` (new, not in the gate) visits all five screens plus
the empty, error, not-available and signed-out states, checks each at 390 x 844 for sideways
overflow (all 0 px), and captures them.

**Copy pass.** Messages were already specific. One changed: "The repository was not found or is
not public." now adds "bumpcheck reads public repositories only." (story 6). The add-form
placeholder is shorter ("owner/repo or a GitHub URL"). Landing copy rewritten around the same
facts.

**Scaffold leftovers**
- Removed: `src/pages/(app)/(protected)/api-status.tsx` and its only test user
  `tests/collab.spec.ts` (not in the gate; its "each browser shows its own account" check is now
  in the new users test); `src/ai/` (`agent.ts`, `chat-routes.ts`, `tools.ts`), `registerAgent`
  in `worker.ts`, `<AgentTools />` in `(app)/_layout.tsx` and the now-unused `resolveAgentAuth`
  in `src/server/http-routes.ts`. The in-app chat was off already (`inApp` false); what went is the
  route that exposed generic record tools to a member's local assistant. The judge uses
  `createDeepSpaceAI` from `deepspace/worker` directly and is untouched. `AGENTS.md`'s paragraph
  about `src/ai/tools.ts` is updated to say so.
- Removed UI components nothing imported: Checkbox, EmptyState, Label, Popover, SearchInput,
  Select, Tabs, Textarea. Kept Dialog (Modal is built on it).
- **The scaffold `/settings` ("Your account") page is removed**, with its nav entry. Everything it
  showed (name, email, sign out) is in the account menu; the only "Settings" left is per project.
- Left, and why: `src/products.ts` and `src/subscriptions.ts` (nothing imports them, but
  `deepspace deploy` reads them to sync the payment catalog; unverified what it does without them);
  `src/stale-chunk-recovery.ts` (used by `main.tsx`); the Yjs, Canvas and Presence Durable Objects
  in `worker.ts` and their routes in `src/server/realtime-routes.ts` (removing a DO class changes
  the deploy manifest; not worth the risk tonight); `src/pages/(app)/home.tsx` (the redirect that
  sign-in lands on, used by the smoke tests); `ErrorScreen` (the root error boundary); the scaffold
  `settings` collection in `src/schemas/admin-schema.ts` (admin-only, unused; removing a
  collection was not checked against the deploy). `src/seo.ts` already had real text.

**The `users` collection (added by the supervisor from ticket 05)**
- Before: rows were already `read: 'own'` for viewer and member, so nobody read another user's
  email. But the room's roster (`user.list`) used the platform default `'public-identity'`: any
  signed-in member received every user's id, name, picture, role and last-seen time. A signed-out
  visitor received an empty roster (the SDK returns none to an anonymous id).
- Now: `roster: 'read-policy'` in `src/schemas/users-schema.ts`. A member's roster and `users`
  query hold only their own row; a signed-out visitor gets no rows and an empty roster; the app
  owner (admin) still reads all. Server code (`RecordRoomStore.getUserEmail`) runs with RBAC off
  and is unaffected (the alerts spec, which sends through it, is green). The nav chip reads the
  auth profile, not the roster, and still shows the user's own name and email (tested).
- Test: `tests/sharing.spec.ts`, "nobody but the user themself reads their name or email from
  the users collection; the nav still shows your own", in the style of the wire tests there. New
  helper `askUserList` in `tests/helpers/app.ts`.

**README.md** (new) and **WRITEUP.md** (new, draft, about 1,000 words with headings; a little
over the 900 aimed for). The writeup has `TODO(supervisor)` markers for "What Dustin decided,
verified or changed" and for the pre-deploy live check's numbers, since the 7.9-credit figure is
from before 06b raised the output cap.

**Red/green log** (rule 12)
| Test | Red result |
|---|---|
| `tests/sharing.spec.ts` › `nobody but the user themself reads their name or email from the users collection; the nav still shows your own` | Test first, before the schema change: `expect(received).toEqual(expected) ... Array [ "0VFOJ3...", + "UnVsF80K..." ]` at `roster.users.map(...)`: Bob's roster contained Alice's id. Green after `roster: 'read-policy'`. |
| `src/schemas.test.ts` › `users (the platform collection)` › `applies the same rule to the room's user list, not the platform's public roster` | Written after the change. Red by mutation (the `roster` line commented out): `AssertionError: expected undefined to be 'read-policy'`. Restored. |
| `src/schemas.test.ts` › `users` › `lets a viewer or member read only their own row; the app owner reads all` | Pins the existing rule; passed on first run (no code change behind it). |
The visual work has no test-first form: it is checked by the screenshots below and by the
existing tests staying green.

**Tests touched, none weakened**
- `tests/sharing.spec.ts`: the new test above; import of `askUserList`.
- `tests/helpers/app.ts`: new `askUserList`.
- `tests/projects.spec.ts`, `src/engine/add-project.test.ts`, `src/engine/scan.test.ts`: the
  expected repo-not-found message gained its new second sentence (copy change, same assertion).
- `tests/collab.spec.ts`: deleted with the api-status page it drove (it was not in the gate).
- `tests/evidence.spec.ts`: new, outside the gate.
- No selector had to change: test ids, roles and accessible names were kept.

**Evidence** (`specs/bumpcheck/evidence/07/`). Taken by `tests/evidence.spec.ts` with
`BUMPCHECK_EVIDENCE=specs/bumpcheck/evidence/07`, against the local fake-services server. Pages
scroll inside `<main>`, so the spec grows the window to the content height for whole-page captures.
- Taken with `npx deepspace test screenshot` (signed out): `landing-cli.png`,
  `landing-cli-390.png`, `public-view-cli.png`, `public-view-cli-390.png`,
  `signed-out-wall-cli.png`.
- The browser test's own captures. Signed in as Alice (the screenshot command cannot sign in):
  `projects.png` / `projects-390.png` (list), `project-page.png` / `-390`, `project-settings.png` /
  `-390`; empty state `projects-empty.png` / `-390`; error states `project-scan-failed.png` / `-390`
  (a failed scan with Retry) and `projects-add-error.png` / `-390` (repo not found). Signed out:
  `landing.png` / `-390`, `public-view.png` / `-390`, `public-view-not-available.png` / `-390`,
  `signed-out-wall.png` / `-390`.

**Left undone, unverified, or open**
- Not run: `vite build` (rule from the supervisor), so the prerendered landing was checked by
  `prerender.test.ts` only, not by a real build. The favicon SVG and `index.html` change are
  likewise unchecked in a built bundle.
- Not verified: whether `deepspace deploy` would cope with `products.ts` / `subscriptions.ts`
  removed (left in place), and that removing the agent routes has no deploy-side check (the CLI
  only says `agent tools` will find nothing).
- The loading and error states of the record room are still not driven by a test (the local room
  cannot be made to fail), as noted in tickets 03 to 06.
- The alert email was not restyled (its snapshot files pin it); it shares the palette, its button
  is ink rather than the accent blue.
- The live check was not run (rule 7).
- The gate output below is from the final code tree. The only changes after it are this note, the
  Status line and the evidence images.

**`npm run gate` output (full)**
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
      Tests  654 passed (654)
   Start at  06:07:03
   Duration  2.55s (transform 3.89s, setup 0ms, import 11.97s, tests 1.29s, environment 6ms)


> bumpcheck@0.0.1 test:smoke
> deepspace test run smoke

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:07:12 AM [generouted] scanned 7 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5079 ms
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

  ✓  1 tests/smoke.spec.ts:21:3 › Smoke tests › static landing loads without JS errors (784ms)
  ✓  2 tests/smoke.spec.ts:29:3 › Smoke tests › landing carries one title, one description, one canonical (397ms)
  ✓  3 tests/smoke.spec.ts:40:3 › Smoke tests › static contract: landing fires no auth request, opens no websocket (1.9s)
  ✓  4 tests/smoke.spec.ts:55:3 › Smoke tests › dynamic app boundary mounts on /home (552ms)
  ✓  5 tests/smoke.spec.ts:60:3 › Smoke tests › sign-in button visible when logged out (510ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  6 tests/smoke.spec.ts:66:3 › Smoke tests › unknown route shows 404 (398ms)

  6 passed (13.2s)

> bumpcheck@0.0.1 test:api
> deepspace test run api

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:07:29 AM [generouted] scanned 7 routes in 11 ms
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

Running 2 tests using 1 worker

  ✓  1 tests/api.spec.ts:4:3 › API tests › auth proxy forwards to auth worker (84ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  2 tests/api.spec.ts:9:3 › API tests › WebSocket endpoint exists (929ms)

  2 passed (8.6s)

> bumpcheck@0.0.1 test:signed-in
> deepspace test run tests/projects.spec.ts && deepspace test run tests/project-page.spec.ts && deepspace test run tests/sharing.spec.ts && deepspace test run tests/alerts.spec.ts && deepspace test run tests/scheduling.spec.ts

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:07:41 AM [generouted] scanned 7 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4976 ms
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
  ✓   1 tests/projects.spec.ts:73:1 › the projects list starts empty, a project is added, and its first scan finishes while watching (4.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   2 tests/projects.spec.ts:105:1 › adding the same repo twice is refused with its own message (2.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   3 tests/projects.spec.ts:119:1 › the project limit is reported, and nothing is added past it (3.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
  ✓   4 tests/projects.spec.ts:140:1 › add requests sent at the same moment cannot get past the project limit (3.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   5 tests/projects.spec.ts:156:1 › a repo that cannot be scanned is refused with the reason, inline (2.5s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
  ✓   6 tests/projects.spec.ts:178:1 › one user's projects are not in another user's list (3.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   7 tests/projects.spec.ts:193:1 › an action needs a verified sign-in: no token, no project (38ms)
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
  ✓   8 tests/projects.spec.ts:205:3 › the job room is locked down › a member cannot enqueue a job, and cannot read the queue (5.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/projects.spec.ts:228:3 › the job room is locked down › a signed-out visitor cannot enqueue a job either (2.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/projects.spec.ts:239:1 › a signed-in member cannot call an owner-billed integration from the browser (518ms)

  10 passed (36.1s)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:08:20 AM [generouted] scanned 7 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5137 ms
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
  ✓   1 tests/project-page.spec.ts:76:1 › the report sorts every dependency into its group and section, each in its own state (3.6s)
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
  ✓   3 tests/project-page.spec.ts:207:1 › the server refuses to review a verdict that is not in the project, or a failed one (3.9s)
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
  ✓   5 tests/project-page.spec.ts:251:1 › the projects list shows each project's count of unreviewed breaking upgrades (3.2s)
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
  ✓   6 tests/project-page.spec.ts:277:1 › Bob cannot see Alice's private project by URL, and cannot act on it (7.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
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
  ✓   7 tests/project-page.spec.ts:324:1 › "check this one" reads only that dependency, and progress shows while it runs (6.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/project-page.spec.ts:372:1 › a second request while a check is running is refused: one scan at a time (5.1s)
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
  ✓   9 tests/project-page.spec.ts:389:1 › a verdict read from a later version is not shown to a project on an older one, until its own check reads the wider range (9.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/project-page.spec.ts:420:1 › a check that cannot finish says so, keeps the report, and can be asked again (8.1s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  11 tests/project-page.spec.ts:447:1 › a failed verdict has a retry button, and retrying judges that verdict again (3.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
  ✓  12 tests/project-page.spec.ts:484:1 › scan progress is shown live while the first scan runs (6.4s)
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
  ✓  14 tests/project-page.spec.ts:516:1 › opening a project records that it was opened (2.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  14 passed (1.3m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:09:41 AM [generouted] scanned 7 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5040 ms
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

Running 11 tests using 1 worker

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
  ✓   1 tests/sharing.spec.ts:156:1 › a project is private until its owner switches it to public on the settings page, which then shows the link (5.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
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
  ✓   2 tests/sharing.spec.ts:204:1 › a public report is readable signed-out, offers no actions, and what the reader received names nobody (10.2s)
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
  ✓   3 tests/sharing.spec.ts:298:1 › another signed-in user reads a public report the same way: no actions, no owner (16.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
  ✓   4 tests/sharing.spec.ts:335:1 › nobody but the user themself reads their name or email from the users collection; the nav still shows your own (12.7s)
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
  ✓   5 tests/sharing.spec.ts:380:1 › a private project's link shows "not available", signed-out and to Bob, exactly like a link to nothing (16.3s)
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   6 tests/sharing.spec.ts:436:1 › switching back to private removes access, even from a page that is already open (14.0s)
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
  ✓   7 tests/sharing.spec.ts:475:1 › only the owner can change who sees a project (16.4s)
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "set-visibility" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/sharing.spec.ts:544:1 › a public report follows its project: a check that finishes shows up for the reader (5.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-publish-example" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   9 tests/sharing.spec.ts:563:1 › the landing page says what bumpcheck does, links to the example report, and offers sign-in (3.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/sharing.spec.ts:601:1 › the test-only example fixture is not an open door (18ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  11 tests/sharing.spec.ts:606:1 › nothing public is left behind (4.5s)

  11 passed (1.9m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:11:40 AM [generouted] scanned 7 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5190 ms
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
  ✓  1 tests/alerts.spec.ts:142:1 › alerts are off by default; the settings toggles persist across a reload (6.6s)
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
[WebServer] [cron] daily-scans ok 24ms
[WebServer] [alert] sent, 2 verdicts
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 26ms
[WebServer] [alert] not sent: nothing-new
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  2 tests/alerts.spec.ts:180:1 › a daily scan sends one alert to the owner, logs it, and does not send it again (9.7s)
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
  ✓  4 tests/alerts.spec.ts:288:1 › a test email that cannot be sent is shown as failed, with the reason (4.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
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
  ✓  5 tests/alerts.spec.ts:310:1 › the unsubscribe link turns alerts off while signed out: the page asks once, and one click does it (6.9s)
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
  ✓  6 tests/alerts.spec.ts:362:1 › a mail client's one-click POST unsubscribes without a sign-in, and only the project the link names (7.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  7 tests/alerts.spec.ts:398:1 › a bad unsubscribe link gets a plain error page (124ms)
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
  ✓  8 tests/alerts.spec.ts:410:1 › only the owner can change alerts, send a test, or delete a project (10.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
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
  ✓  9 tests/alerts.spec.ts:448:1 › delete removes the project, its send log and its public report, and frees a slot (18.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  9 passed (1.3m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:13:03 AM [generouted] scanned 7 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5225 ms
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
[WebServer] [cron] daily-scans ok 6ms
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 27ms
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 7ms
  ✓   1 tests/scheduling.spec.ts:132:1 › the scheduled task, triggered directly, re-scans a due project and leaves one that is not due (10.4s)
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
[WebServer] [cron] daily-scans ok 24ms
[WebServer] [alert] not sent: alerts-off
  ✓   2 tests/scheduling.spec.ts:163:1 › an idle project is not scanned until its owner opens it again (7.1s)
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
  ✓   3 tests/scheduling.spec.ts:194:1 › scan now inside the cooldown shows a notice with the time it returns; after the cooldown it scans (4.3s)
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
  ✓   4 tests/scheduling.spec.ts:236:1 › scan now is refused while a scan is running: one scan at a time (6.9s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 24ms
[WebServer] [alert] not sent: alerts-off
  ✓   5 tests/scheduling.spec.ts:260:1 › a scan that stops at its limit says so, and a later scan reads the rest (4.5s)
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
[WebServer] [cron] daily-scans ok 25ms
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
[WebServer] [cron] daily-scans ok 5ms
  ✓   7 tests/scheduling.spec.ts:339:1 › a failed scan shows its reason and a retry, and the retry is under the cooldown (15.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
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
  ✓   9 tests/scheduling.spec.ts:393:1 › add-project attempts are capped per user per day, and the refusal says when the cap resets (10.8s)
[WebServer] [alert] not sent: alerts-off
  ✓  10 tests/scheduling.spec.ts:426:3 › the cron room is locked down › a member cannot trigger, pause or resume the scheduled task (4.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  11 tests/scheduling.spec.ts:433:3 › the cron room is locked down › a signed-out visitor cannot either (3.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  12 tests/scheduling.spec.ts:439:3 › the cron room is locked down › the test-only trigger is not an open door: it needs a sign-in (14ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
  ✓  13 tests/scheduling.spec.ts:445:1 › nothing is left behind for the next run of the scheduled task (2.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  13 passed (1.4m)
```
