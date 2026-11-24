# 08 — Deploy checkpoint

**Status:** done (by the supervisor, on Dustin's authority)

**Who:** supervisor and Dustin only. **No worker is assigned to this ticket.**
**Changes a page:** no · **Blocked by:** 07 · **Decisions:** 16, 17

A worker that is handed this ticket must stop and report. It involves a deploy, the live
check, paid calls and account usage, all of which are outside worker rules.

## Goal

The core is live and verified before the stretch starts. Impact analysis (tickets 09 and 10)
does not begin until this ticket is closed.

## Steps

Use Node 24 (`nvm use`) for every command.

1. **Supervisor:** on a clean tree at the commit to be deployed (`ralph/bumpcheck`, or `main` once Dustin has merged), run `npm run gate`. Paste the full output below. Stop if
   it is not green.
2. **Supervisor or Dustin:** run `npm run live-check` (one real scan of
   `dustinJ15/bumpcheck-example`, one real test email). Record what it printed as spent.
3. **Dustin:** read the account's usage. Record the true cost of one verdict. If it differs
   much from the one-cent estimate, retune the limits in the config module, rerun the gate,
   and commit.
4. **Dustin:** settle the two unverified items from the spec:
   - Was the unauthenticated Releases fallback refused? If it is unreliable, deciding whether
     a token goes in the secret store is Dustin's call.
   - Did the test email arrive with a `List-Unsubscribe` header, and does the plain-text part
     match the HTML?
5. **Dustin:** deploy by hand. Never `deepspace push`; GitHub is the source authority.
6. **Dustin:** on the live app: sign in; add `dustinJ15/bumpcheck-example`; watch the scan
   finish; make it public; open the public link signed out; set the landing page's example
   constant to that project and redeploy if it changed; send a test email and use its
   unsubscribe link.
7. **Dustin:** confirm remaining credits leave room for the stretch and the grading period.

**Supervisor notes on the deploy command (2026-11-24, from `deploy --help` and `status`):**
`deepspace deploy` syncs DeepSpace source by default (`--push`). Always pass `--no-push`, so
nothing is pushed to the platform's cloud repo. `deepspace status` reports "Source unclaimed ·
first release claims GitHub (dustinj15/bumpcheck) from this checkout's remote, permanently",
which matches the spec; deploy from `main` after the merge, on a clean tree. Deploy builds
the current working tree.

## Done means

- The full pasted output of `npm run gate` from the deployed commit, all green.
- The live check's printed spend, the measured cost per verdict, and remaining credits.
- The answers to the two unverified items.
- The deployed commit hash and the live URL.
- Dustin's go or no-go on starting tickets 09 and 10, given the time left before the deadline
  (Wednesday 2026-11-25, 11:59 PM Eastern).

No screenshot is required by rule, since no page changes; Dustin's check of the live pages in
step 6 stands in for it.

## Completion

Filled in by the supervisor, who did every step on Dustin's authority (see the handoff,
"Authority widened by Dustin").

**Step 1: gate on a clean tree at `e719b84`** (2026-11-24, all green):

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
   Start at  06:18:07
   Duration  2.56s (transform 3.44s, setup 0ms, import 12.11s, tests 1.46s, environment 6ms)


> bumpcheck@0.0.1 test:smoke
> deepspace test run smoke

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:18:17 AM [generouted] scanned 7 routes in 12 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5416 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] 

Running 6 tests using 1 worker

  ✓  1 tests/smoke.spec.ts:21:3 › Smoke tests › static landing loads without JS errors (791ms)
  ✓  2 tests/smoke.spec.ts:29:3 › Smoke tests › landing carries one title, one description, one canonical (403ms)
  ✓  3 tests/smoke.spec.ts:40:3 › Smoke tests › static contract: landing fires no auth request, opens no websocket (1.9s)
  ✓  4 tests/smoke.spec.ts:55:3 › Smoke tests › dynamic app boundary mounts on /home (575ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  5 tests/smoke.spec.ts:60:3 › Smoke tests › sign-in button visible when logged out (622ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  6 tests/smoke.spec.ts:66:3 › Smoke tests › unknown route shows 404 (407ms)

  6 passed (13.7s)

> bumpcheck@0.0.1 test:api
> deepspace test run api

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:18:34 AM [generouted] scanned 7 routes in 12 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5183 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] 

Running 2 tests using 1 worker

  ✓  1 tests/api.spec.ts:4:3 › API tests › auth proxy forwards to auth worker (78ms)
  ✓  2 tests/api.spec.ts:9:3 › API tests › WebSocket endpoint exists (848ms)

  2 passed (9.6s)

> bumpcheck@0.0.1 test:signed-in
> deepspace test run tests/projects.spec.ts && deepspace test run tests/project-page.spec.ts && deepspace test run tests/sharing.spec.ts && deepspace test run tests/alerts.spec.ts && deepspace test run tests/scheduling.spec.ts

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:18:47 AM [generouted] scanned 7 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5214 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] 

Running 10 tests using 1 worker

[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   1 tests/projects.spec.ts:73:1 › the projects list starts empty, a project is added, and its first scan finishes while watching (4.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   2 tests/projects.spec.ts:105:1 › adding the same repo twice is refused with its own message (2.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [alert] not sent: alerts-off
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   3 tests/projects.spec.ts:119:1 › the project limit is reported, and nothing is added past it (3.0s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [alert] not sent: alerts-off
[WebServer] [alert] not sent: alerts-off
  ✓   4 tests/projects.spec.ts:140:1 › add requests sent at the same moment cannot get past the project limit (4.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   5 tests/projects.spec.ts:156:1 › a repo that cannot be scanned is refused with the reason, inline (2.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
  ✓   6 tests/projects.spec.ts:178:1 › one user's projects are not in another user's list (3.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   7 tests/projects.spec.ts:193:1 › an action needs a verified sign-in: no token, no project (44ms)
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
  ✓   8 tests/projects.spec.ts:205:3 › the job room is locked down › a member cannot enqueue a job, and cannot read the queue (4.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/projects.spec.ts:228:3 › the job room is locked down › a signed-out visitor cannot enqueue a job either (2.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/projects.spec.ts:239:1 › a signed-in member cannot call an owner-billed integration from the browser (691ms)

  10 passed (37.6s)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:19:28 AM [generouted] scanned 7 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5157 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
[WebServer] 

Running 14 tests using 1 worker

[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   1 tests/project-page.spec.ts:76:1 › the report sorts every dependency into its group and section, each in its own state (3.7s)
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
  ✓   2 tests/project-page.spec.ts:167:1 › a verdict is marked as reviewed, moves to the collapsed section, and undo brings it back (4.0s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   3 tests/project-page.spec.ts:207:1 › the server refuses to review a verdict that is not in the project, or a failed one (4.2s)
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
  ✓   5 tests/project-page.spec.ts:251:1 › the projects list shows each project's count of unreviewed breaking upgrades (3.3s)
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   6 tests/project-page.spec.ts:277:1 › Bob cannot see Alice's private project by URL, and cannot act on it (7.6s)
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
  ✓   7 tests/project-page.spec.ts:324:1 › "check this one" reads only that dependency, and progress shows while it runs (6.0s)
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
  ✓   9 tests/project-page.spec.ts:389:1 › a verdict read from a later version is not shown to a project on an older one, until its own check reads the wider range (9.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  10 tests/project-page.spec.ts:420:1 › a check that cannot finish says so, keeps the report, and can be asked again (8.3s)
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
  ✓  12 tests/project-page.spec.ts:484:1 › scan progress is shown live while the first scan runs (6.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  13 tests/project-page.spec.ts:505:1 › a project with no dependencies shows an empty state, not an empty page (2.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  14 tests/project-page.spec.ts:516:1 › opening a project records that it was opened (2.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  14 passed (1.3m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:20:51 AM [generouted] scanned 7 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5324 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
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
  ✓   1 tests/sharing.spec.ts:156:1 › a project is private until its owner switches it to public on the settings page, which then shows the link (6.4s)
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
  ✓   2 tests/sharing.spec.ts:204:1 › a public report is readable signed-out, offers no actions, and what the reader received names nobody (10.4s)
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
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
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [action] "scan-now" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "mark-reviewed" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "check-dependency" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "set-visibility" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   3 tests/sharing.spec.ts:298:1 › another signed-in user reads a public report the same way: no actions, no owner (12.7s)
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   4 tests/sharing.spec.ts:335:1 › nobody but the user themself reads their name or email from the users collection; the nav still shows your own (12.5s)
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   5 tests/sharing.spec.ts:380:1 › a private project's link shows "not available", signed-out and to Bob, exactly like a link to nothing (16.1s)
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
  ✓   6 tests/sharing.spec.ts:436:1 › switching back to private removes access, even from a page that is already open (13.5s)
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
  ✓   7 tests/sharing.spec.ts:475:1 › only the owner can change who sees a project (16.0s)
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   8 tests/sharing.spec.ts:544:1 › a public report follows its project: a check that finishes shows up for the reader (5.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-publish-example" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/sharing.spec.ts:563:1 › the landing page says what bumpcheck does, links to the example report, and offers sign-in (3.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/sharing.spec.ts:601:1 › the test-only example fixture is not an open door (17ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  11 tests/sharing.spec.ts:606:1 › nothing public is left behind (4.1s)

  11 passed (1.8m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:22:45 AM [generouted] scanned 7 routes in 12 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5164 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
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
[WebServer] [cron] daily-scans ok 27ms
[WebServer] [alert] sent, 2 verdicts
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 27ms
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
  ✓  3 tests/alerts.spec.ts:232:1 › a test send appears in the log, and the fourth test send in a day is refused (7.5s)
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
  ✓  4 tests/alerts.spec.ts:288:1 › a test email that cannot be sent is shown as failed, with the reason (3.8s)
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
  ✓  6 tests/alerts.spec.ts:362:1 › a mail client's one-click POST unsubscribes without a sign-in, and only the project the link names (6.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  7 tests/alerts.spec.ts:398:1 › a bad unsubscribe link gets a plain error page (133ms)
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
  ✓  8 tests/alerts.spec.ts:410:1 › only the owner can change alerts, send a test, or delete a project (10.8s)
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
  ✓  9 tests/alerts.spec.ts:448:1 › delete removes the project, its send log and its public report, and frees a slot (17.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  9 passed (1.3m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 6:24:07 AM [generouted] scanned 7 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5378 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5173/
[WebServer] 
[WebServer] The Cloudflare Vite plugin detected this dev session is running in an AI agent.
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
[WebServer] [cron] daily-scans ok 28ms
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 5ms
  ✓   1 tests/scheduling.spec.ts:132:1 › the scheduled task, triggered directly, re-scans a due project and leaves one that is not due (8.9s)
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
[WebServer] [cron] daily-scans ok 26ms
[WebServer] [alert] not sent: alerts-off
  ✓   2 tests/scheduling.spec.ts:163:1 › an idle project is not scanned until its owner opens it again (7.0s)
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
  ✓   3 tests/scheduling.spec.ts:194:1 › scan now inside the cooldown shows a notice with the time it returns; after the cooldown it scans (4.4s)
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
  ✓   4 tests/scheduling.spec.ts:236:1 › scan now is refused while a scan is running: one scan at a time (6.8s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 27ms
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
[WebServer] [cron] daily-scans ok 25ms
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   6 tests/scheduling.spec.ts:293:1 › the app's daily AI limit stops the judge on every path, and the page says it is a limit (4.7s)
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
  ✓   7 tests/scheduling.spec.ts:339:1 › a failed scan shows its reason and a retry, and the retry is under the cooldown (15.4s)
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
  ✓   9 tests/scheduling.spec.ts:393:1 › add-project attempts are capped per user per day, and the refusal says when the cap resets (10.6s)
[WebServer] [alert] not sent: alerts-off
  ✓  10 tests/scheduling.spec.ts:426:3 › the cron room is locked down › a member cannot trigger, pause or resume the scheduled task (4.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  11 tests/scheduling.spec.ts:433:3 › the cron room is locked down › a signed-out visitor cannot either (3.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  12 tests/scheduling.spec.ts:439:3 › the cron room is locked down › the test-only trigger is not an open door: it needs a sign-in (15ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
  ✓  13 tests/scheduling.spec.ts:445:1 › nothing is left behind for the next run of the scheduled task (2.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  13 passed (1.4m)
```

**Step 2: live check** (2026-11-24, second run, after ticket 06b). Spent 5.20 credits. Total
used on the account after it: 13.09 of 500 credits. All 7 verdicts that failed in the first
run were read on their first retry with the fixed judge: 12 of 12 verdicts read, 0 failed.
Measured cost per verdict: about US$0.0026 (Claude), about 0.26 credits. No retuning of the
limits needed: 150 AI calls a day is at most about 39 credits a day.

```
[live-check] credits used before: 7.895147
[live-check] add-project: {"success":true,"data":{"projectId":"1795527006360_7rbc3r"}}
[live-check] scan status: done
[live-check] row text: dustinj15/bumpcheck-example 3 breaking to review View on GitHub · 13 dependencies Scanned Nov 24, 2026, 6:30 AM
[live-check] verdicts after the scan (a failed one may be cached from an earlier run): 12 verdicts
[live-check]   chalk: breaking (Breaking)
[live-check]   dotenv: breaking (Breaking)
[live-check]   node-fetch: breaking (Breaking)
[live-check]   zod: unclear (Unclear)
[live-check]   commander: failed (Verdict failed) -- commander Verdict failed 9.5.0 → 15.1.0 Retry This upgrade could not be read: response is not valid JSON. Last tried Nov 24, 2026, 5:26 AM. Read from the changelog.
[live-check]   date-fns: failed (Verdict failed) -- date-fns Verdict failed 2.30.0 → 4.4.0 Retry This upgrade could not be read: response is not valid JSON. Last tried Nov 24, 2026, 5:26 AM. Read from the releases page.
[live-check]   express: failed (Verdict failed) -- express Verdict failed 4.18.2 → 5.3.0 Retry This upgrade could not be read: response is not valid JSON. Last tried Nov 24, 2026, 5:26 AM. Read from the releases page.
[live-check]   uuid: failed (Verdict failed) -- uuid Verdict failed 8.3.2 → 14.0.3 Retry This upgrade could not be read: response is not valid JSON. Last tried Nov 24, 2026, 5:27 AM. Read from the changelog.
[live-check]   typescript: unclear (Unclear)
[live-check]   eslint: failed (Verdict failed) -- eslint Verdict failed 8.57.0 → 10.15.0 Retry This upgrade could not be read: response is not valid JSON. Last tried Nov 24, 2026, 5:27 AM. Read from the releases page.
[live-check]   prettier: failed (Verdict failed) -- prettier Verdict failed 2.8.8 → 3.10.1 Retry This upgrade could not be read: response is not valid JSON. Last tried Nov 24, 2026, 5:27 AM. Read from the changelog.
[live-check]   vite: failed (Verdict failed) -- vite Verdict failed 4.5.0 → 8.3.8 Retry This upgrade could not be read: response is not valid JSON. Last tried Nov 24, 2026, 5:28 AM. Read from the changelog.
[live-check]   5 read, 7 failed
[live-check] retry-verdict commander: {"success":true,"data":{"packageName":"commander"}}
[live-check] retry-verdict date-fns: {"success":true,"data":{"packageName":"date-fns"}}
[live-check] retry-verdict express: {"success":true,"data":{"packageName":"express"}}
[live-check] retry-verdict uuid: {"success":true,"data":{"packageName":"uuid"}}
[live-check] retry-verdict eslint: {"success":true,"data":{"packageName":"eslint"}}
[live-check] retry-verdict prettier: {"success":true,"data":{"packageName":"prettier"}}
[live-check] retry-verdict vite: {"success":true,"data":{"packageName":"vite"}}
[live-check] verdicts after one retry of each failed one: 12 verdicts
[live-check]   chalk: breaking (Breaking)
[live-check]   commander: breaking (Breaking)
[live-check]   date-fns: breaking (Breaking)
[live-check]   dotenv: breaking (Breaking)
[live-check]   express: breaking (Breaking)
[live-check]   node-fetch: breaking (Breaking)
[live-check]   uuid: breaking (Breaking)
[live-check]   zod: unclear (Unclear)
[live-check]   eslint: breaking (Breaking)
[live-check]   prettier: breaking (Breaking)
[live-check]   vite: breaking (Breaking)
[live-check]   typescript: unclear (Unclear)
[live-check]   12 read, 0 failed
[live-check] SPENT ON 7 RETRIES: 3.1186480000000003 credits (may lag; the total below includes them)
[live-check] send-test-email: {"success":true,"data":{"remaining":2}}
[live-check] the test email was addressed to the test account's sign-in address (bumpcheck-alice@deepspace.test), which has no inbox.
[live-check] to see one in a mail client, with its List-Unsubscribe header: sign in as yourself and press "Send me a test".
[live-check] send log: Nov 24, 2026, 6:31 AM Test Sent 
[live-check] delete-project: {"success":true,"data":{"projectId":"1795527006360_7rbc3r"}}
[live-check] credits used after: 13.093795
[live-check] SPENT BY THIS RUN: 5.198648 credits (100 credits = US$1)
[live-check] usage by integration: [{"name":"anthropic","totalCost":0.06073795,"count":26},{"name":"github","totalCost":0.0442,"count":27},{"name":"email","totalCost":0.026000000000000002,"count":2}]
[live-check] if "spent" is 0, usage may not be recorded yet: run `npx deepspace app usage` again in a minute.
  ✓  1 tests/live/live-check.live.ts:108:1 › live check: one real scan of the example repo, then one real test email (2.1m)
  1 passed (2.2m)
```

**Step 4, unverified items:** the Releases fallback was not refused in either live run
(several verdicts were read from releases pages). The `List-Unsubscribe` header: the live
check's email went to the Alice test account, which has no inbox, so it is still unverified.


**Step 3, cost.** One verdict costs about US$0.0025. The live site's first scan of the example
repo: 11 Claude calls, about US$0.026. Account total after every live check and the production
scan: 19.29 of 500 credits used, 480.71 left. No limit needed retuning.

**Step 4, the two unverified items, answered.**
- The unauthenticated Releases fallback: refused once on the live site (typescript), shown as
  "not read this time"; read fine for chalk, date-fns, express, eslint and others. Partly
  reliable. A token in the secret store is left as Dustin's decision.
- The email: a test email sent from the live site to dbj2297@gmail.com arrived from
  `notifications@updates.app.space` with `List-Unsubscribe` (HTTPS link) and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, DKIM and SPF passing, and a
  text/plain plus text/html body. The plain text carries the same content.

**Step 5, deploy.** Merged `ralph/bumpcheck` into `main` by fast-forward and pushed both to
GitHub. Deployed `b765fc2` with `npx deepspace deploy --no-push`; the first release claimed
GitHub as the source. Redeployed `586292c` after setting `EXAMPLE_PROJECT_ID` (gate green on
that tree first). Live URL: https://bumpcheck.app.space. Checked that no `.dev.vars` was
uploaded with the static assets (every guessed path returns 404).

**Step 6, live-site check** (signed in through Dustin's GitHub session in Chrome; Google asked
for a phone prompt, so it was not used): added `dustinJ15/bumpcheck-example`, watched the scan
finish (13 dependencies, 10 breaking, 1 unclear, 1 not read because GitHub refused its release
notes); made it public; opened the share link signed out (read-only, no actions, no name,
evidence `specs/bumpcheck/evidence/08/live-public-report.png`); set the landing page's example
constant and redeployed; the landing link points at the report; sent a test email and used its
unsubscribe link (confirmation page, one click, alerts off, the open settings tab updated live);
a forged unsubscribe token gets 400. Alerts are left off on that project.

**Step 7 and the stretch.** 480 credits remain. Tickets 09 and 10 (impact analysis) are not
started: Dustin is away and asked for the project to be submitted before the deadline, so the
core is submitted as it stands and the writeup lists the stretch as not built.
