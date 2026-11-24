# 04 — Scheduling and limits

**Status:** done

**Who:** worker · **Changes a page:** yes · **Blocked by:** 03
**Stories:** 24–30, 57 · **Decisions:** 8, 9, 15

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

## Goal

Projects re-scan daily on their own, nothing can spend past the budget, and every limit that
stops a scan says so on the page.

## Build

**Scheduled task** (`src/cron.ts`): one task, hourly. It selects projects that are due (last
scan over 24 hours ago), not idle (opened within 7 days) and not already scanning, and enqueues
a bounded number per tick. The bound lives in the config module. Selection uses ticket 01's
limits module; the task itself stays thin.

**Scan now action:** enforces the 10-minute cooldown and the one-scan-at-a-time rule, then
enqueues. A refusal returns when it will be available.

**Daily ceiling:** the usage row counts AI calls app-wide per day. Confirm every path that can
reach the judge (first scan, daily scan, scan now, check one, retry) goes through the same
check. The owner is exempt from per-user limits and from nothing else.

**Failed scans:** a scan is retried once, then shown as failed with its reason and a retry
button. Stored verdicts are kept.

**Idle resume:** opening an idle project (ticket 03's "opened" action) makes it due again, so
daily scans resume without another click.

**Page notices** on the project page: "scan now" cooling down, with the time it returns; scan
stopped at its limit and the rest will be read by later scans; the app's daily AI limit has
been reached; scan failed, with reason and retry.

**Added by the supervisor from tickets 01 and 02** (decided under Dustin's "use your
discretion" instruction of 2026-11-23):

- **Add-project attempts are capped per user per day.** Every well-formed add request costs
  the owner one or two GitHub calls even when it is refused, so a signed-in user could loop
  it. Add a limit to the config module (20 attempts per user per UTC day; the owner is exempt,
  as for other per-user limits), decide it in the limits module, count it server-side, and
  refuse with a message saying when it resets. Count before the GitHub call is made.
- **A scan that fails for a repo problem must not stay due every hour.** The engine does not
  set the last-scan time on such a failure, so the hourly tick would re-pick it forever.
  Record the attempt so the project is next due after the normal re-scan interval.
- **A project must not stay "queued" or "scanning" forever.** If the job room ends a job
  without calling the handler (for example a cancel between ticks), nothing resets the row.
  Treat a project whose scan has shown no progress for a bounded time (a config value) as
  failed with a reason and a retry, in the hourly task.
- **A refused Releases request must not be cached as "no changelog found" for everyone.** The
  source host cannot currently tell "this package has no releases" from "GitHub refused the
  unauthenticated request". Make the interface distinguish them. On a refusal, store no shared
  verdict: show the dependency as not read this time, and let the next scan try again. It
  must still cost no AI call.

- **From ticket 03:** check and retry are refused unless the project's scan status is "done",
  so the stalled-scan handling above is what unblocks a stuck project; cover that in a test.
  If a record write fails after a successful judge call, the retried step must not pay for
  the same verdict again (look for the stored verdict before asking the judge).

## Tests required

- Unit: due, idle and cooldown at their boundaries (extend ticket 01's tests if gaps remain);
  the selection function picks due, non-idle, non-scanning projects and respects the bound.
- Engine: a failed scan retries once, then is marked failed with old verdicts intact; the
  owner passes the project limit but is stopped by the daily ceiling.
- Unit or engine: the add-attempt cap at its boundary and the owner exemption; a repo-problem
  failure is not due again until the re-scan interval; a stalled scan is marked failed; a
  refused Releases request stores no verdict and spends no judge call.
- Browser: trigger the scheduled task directly (do not wait for the schedule) and see a due
  project re-scan; scan now inside the cooldown shows the notice.

## Done means

Acceptance: the behaviours above hold against the fakes; the gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and
screenshots from `npx deepspace test screenshot` of the project page showing each of the four
notices, saved under `specs/bumpcheck/evidence/04/`.

## Completion

Completed 2026-11-24 on `ralph/bumpcheck`.

**What was built**

- Config (`src/config.ts`): `LIMITS.addAttemptsPerUserPerDay` 20, and a new `SCHEDULE` block:
  `taskName` `daily-scans`, `tickIntervalMinutes` 60, `scansPerTick` 5, `stalledScanMs` 30
  minutes. No number for this ticket is written anywhere else.
- Pure rules (no `deepspace` import):
  - `src/core/limits.ts`: `isProjectDue` now takes `{ nextDueAt, now }` (null means due),
    `nextDueTime`, `mayAttemptAddProject`, `isScanStalled`, `nextUtcDayStart`, `isoToTime`.
  - `src/core/schedule.ts` (new): `selectDueProjects` (due, not idle, not queued or
    scanning, at most the bound, most overdue first), `selectStalledScans`,
    `dueTimeAfterOpening` (idle resume).
  - `src/core/requests.ts`: `checkScanNowRequest` (one scan at a time, then the cooldown;
    a refusal carries `availableAt`).
  - `src/core/report.ts`: `countDeferred`, which the page's limit notices are drawn from.
- Engine (no `deepspace` import):
  - `src/engine/schedule.ts` (new): `runScheduleTick`, one run of the scheduled task. Marks
    stalled scans failed, then marks due projects "queued" and enqueues them.
  - `src/engine/scan.ts`: every full scan that ends writes `nextDueAt` (`markScanFailed`
    now does it too); every write that starts a scan or reports progress stamps
    `scanHeartbeatAt`; a refused Releases request stores nothing and marks the dependency
    `deferredBy: 'source-refused'`; the judge step looks for a stored verdict before paying;
    `queuedFields` is the one shape every enqueuer writes.
  - `src/engine/add-project.ts`: the attempt cap, counted before the GitHub call.
- Interfaces (`src/services/types.ts`): `SourceHost.getReleases` answers `found`, `none` or
  `refused` (`ReleasesAnswer`); `RecordStore.listProjects`. Real and fake implementations
  follow (`github-source-host.ts` has the pure `readReleasesAnswer`; `record-room-store.ts`).
- Platform layer:
  - `src/cron.ts`: one task, hourly. Thin: it builds the services and calls
    `runScheduleTick`.
  - `src/actions/scan-now.ts` (new): "scan now", also the Retry of a failed scan.
  - `src/actions/add-project.ts`: counts attempts in the new server-only `attempts`
    collection (`src/schemas/attempts-schema.ts`), one row per attempt.
  - `src/actions/review.ts`: `record-opened` makes an idle project due now.
  - `src/server/realtime-routes.ts`: the cron room is locked to the app owner (below).
  - `projects` schema: one new column, `scanHeartbeatAt`.
- Page: a "Scan now" button and `src/components/report/ScanNotices.tsx` (new) on the
  project page; a row note for an upgrade GitHub would not answer for.
- Fake world (`src/services/fake-world.ts`): three new repos. `bumpcheck-fake/many` (17
  majors, two more than one scan reads), `bumpcheck-fake/outage` (a major whose changelog
  request fails, so the scan fails), `bumpcheck-fake/ratelimited` (a major whose release
  notes are refused). No test-only branch was added to production code paths.
- Tests: `src/core/schedule.test.ts`, `src/engine/schedule.test.ts`, `src/cron.test.ts`
  (new); more cases in `limits`, `requests`, `report`, `scan`, `scan-job`, `on-demand`,
  `tick`, `add-project`, `real-helpers` and `schemas` tests; `tests/scheduling.spec.ts`
  (13 browser tests), added to `npm run test:signed-in` so the gate runs it.

**How each path to the judge goes through the daily-ceiling check**

There is one place in the app that calls the judge: `judgeNext` in `src/engine/scan.ts`.
Before the first attempt it checks `mayJudgeAnother` (15 per scan) and
`isDailyCeilingReached` (150 a day), and it checks the ceiling again before the second
attempt, because the retry is an AI call too. Every path ends in that step:

| Path | Starts in | Job |
|---|---|---|
| First scan | `add-project` action | full scan |
| Daily scan | `src/cron.ts` -> `runScheduleTick` | full scan |
| Scan now, and Retry of a failed scan | `scan-now` action | full scan |
| Check one | `check-dependency` action | on-demand scan |
| Retry a failed verdict | `retry-verdict` action | on-demand scan |

All five only enqueue through `enqueueScan` into the one job room; none calls the judge
itself. The ceiling does not look at whose project it is, so the owner is not exempt.
Tests: full scan at the ceiling and one below it, and the retry attempt (`scan.test.ts`);
the same three for an on-demand scan (`on-demand.test.ts`); and one browser test that
uses up the day's calls and then goes through first scan, scan now, the scheduled scan
and check one, with nothing read on any of them.

**How the scheduled task enqueues, and how it is tested**

`AppCronRoom.onTask` (worker.ts) calls `runTask` in `src/cron.ts`, which calls
`runScheduleTick` with the record store built from the owner's server-side tools, the
system clock, and `enqueueScan(env, { projectId, onDemand: false }, 'schedule')`. That is
the same function the server actions use: it reaches the job room through the worker's
`JOB_ROOMS` binding, which is also bound inside the cron Durable Object, so the job room's
owner-only lock did not need loosening. Each project is marked "queued" before its job is
enqueued, which is what stops the next run, "scan now" and "check this one" from starting
a second scan.

Tested at three levels: `selectDueProjects` (unit, boundaries and the bound),
`runScheduleTick` against the in-memory store (engine), and in the browser:
`test-run-scheduled-task` sends the cron room the platform's own `cron.trigger` message
as the owner and waits for the room's receipt, so the path under test is cron room ->
`onTask` -> `runTask` -> `enqueueScan` -> job room -> scan -> the page updating live.
Nothing waits for the schedule.

**Decisions taken with the supervisor during this ticket (2026-11-23)**

- **The cron room is locked at the route.** In the installed `deepspace` 0.44.2,
  `CronRoom.onConnect` gives write access to role member or admin, the write messages are
  `cron.trigger`, `cron.pause` and `cron.resume`, and `CronRoomConfig` has only `tasks`
  (no authorize option). So any signed-in user could have paused the daily scans for
  everyone. The `/ws/cron` route now passes the role `viewer` for everyone but the app
  owner. Browser tests: Alice's trigger, pause and resume are each refused (`read_only`)
  and the task is still unpaused; the same for a signed-out visitor.
- **The schedule reads `nextDueAt`.** Every full scan that ends, in any way (finished, repo
  problem, second failed tick, cancelled, stalled, could not be enqueued), writes
  `nextDueAt` = now + the re-scan interval. `lastScanAt` still means "last successful
  scan". Consequence, accepted: a scan that failed for a passing reason is not retried by
  the next hourly run; it waits for Retry or tomorrow. The failed-scan notice says so.
- **Idle resume:** `record-opened` on an idle project sets `nextDueAt` to now.
- **Cooldown** counts from the user's own requests (adding the project, scan now), not from
  scheduled scans. Retry of a failed scan is `scan-now` and is under the same cooldown,
  owner included. Both the cooldown notice and the failed-scan notice give the time.
- **Add attempts:** only requests that reach GitHub are counted; free refusals (bad input,
  duplicate, project limit) are not. One row per attempt, counted again after writing.
- **Stalled:** 30 minutes with no sign of life. A stalled full scan becomes "failed"; a
  stalled check becomes "done" with the "last check did not finish" notice (ticket 03's
  rule for failed checks).

**Judgment calls (please confirm)**

- `deferredBy` gained a third value, `source-refused`, and the page has a fifth, neutral
  notice for it ("GitHub did not answer for some release notes"). A refused request does
  not count against the per-scan cap.
- GitHub's Releases API: 404 is read as "none" (a fact about the repo, stored as "no
  changelog found"); 403, 429, 5xx, a network failure, or a 200 whose body is not a list
  are "refused". An empty list is "none".
- "Look before paying" accepts a stored verdict of any status in a full scan (a failed
  verdict's two attempts were paid for; retrying it is the user's button), and any status
  but failed in an on-demand read. It runs before the two limit checks, so a stored
  verdict is attached even at the ceiling.
- `selectDueProjects` treats a project that was never opened as idle, and orders by most
  overdue first (never-scanned before those).
- When a scheduled scan cannot be enqueued the project is marked failed ("The daily scan
  could not be started.") and the attempt is recorded. When `add-project` cannot enqueue
  the first scan, the row is failed with no due time, so the next hourly run starts it.
- The cooldown notice appears when the user presses the button and the server refuses,
  and shows the time the server sent (`details.availableAt`), not a time worked out from
  the browser's clock. It stays until the next press. The button is not disabled during
  the cooldown.
- The limit notices are drawn from the dependencies' `deferredBy` marks, not from
  `scanReport`, so a "check this one" stopped by the daily ceiling counts too.
- One run of the task handles each project on its own: a row that cannot be written is
  skipped and the run goes on (found in review; engine-tested).
- **Three new test-only actions** (`src/actions/test-reset.ts`), each answering "Action
  not found" unless the fake-services setting is on: `test-set-project-times` (sets
  `nextDueAt`, `lastScanRequestedAt`, `lastOpenedAt` on one of the caller's own projects,
  nothing else); `test-use-up-daily-ai-limit` (sets today's AI-call count to the ceiling);
  `test-run-scheduled-task` (sends `cron.trigger` to the cron room as the owner, nothing
  else). `test-reset-my-projects` now also deletes the caller's `attempts` rows, because
  the browser tests add more than 20 projects a day.

**Platform facts checked against the installed `deepspace` 0.44.2**

- Intervals are whole minutes: `validateTask` throws unless `intervalMinutes` is an
  integer from 1 to 10080. As the spec says.
- The schedule arms on the app's first request (`armCronRoom` in worker.ts; the room arms
  its alarm in its first fetch). As the spec says.
- A task can be triggered directly (`cron.trigger`). As the spec says, but by any member
  unless the route narrows the role: see the first decision above.
- **Not in the spec:** an interval task also runs once right after it is first armed (its
  first `next_run_at` is "now"). So a run happens shortly after the first request following
  a deploy, and shortly after every start of the local test server.
- Server-side `records.query` with no `limit` returns every row; `listProjects` relies on
  it. The same query tool supports `offset`, but `ActionTools.query`'s type does not
  declare it.
- `enqueueJob` from inside the cron Durable Object works unchanged (browser-tested).

**Red/green log** (rule 12)

Every test below was written and run red before its code, except where a line says
otherwise. "is not a function" means the function did not exist yet.

| Required test | Test name | Red result |
|---|---|---|
| Unit: due at its boundary | `isProjectDue: re-scan interval > is due 24 hours after its last scan ended, not a millisecond before`; `> is due exactly at its due time, and after it` | `TypeError: nextDueTime is not a function`; `expected false to be true` |
| Unit: idle at its boundary | `selectDueProjects > skips an idle project: one its owner has not opened for 7 days` (ticket 01's `isProjectIdle` boundary test is unchanged and still passes) | Against a stub returning `[]`: `expected [] to deeply equal [ 'a' ]` |
| Unit: cooldown at its boundary | `checkScanNowRequest: "scan now" > refuses inside the 10-minute cooldown and says when it will be available` (ticket 01's `scanNowCooldown` boundary test is unchanged) | `TypeError: checkScanNowRequest is not a function` |
| Unit: selection picks due, non-idle, non-scanning and respects the bound | `selectDueProjects > picks a project that is due, not idle and not scanning`; `> skips a project that is already queued/scanning: one scan at a time`; `> picks at most 5 per run by default, the most overdue first` | Stub: `expected [] to deeply equal [ 'a' ]`; `expected [] to have a length of 5 but got +0`. The two "skips ... queued/scanning" cases passed against the stub (it returns nothing), so their red is the mutation run below: 8 tests red with the filter removed. |
| Engine: a failed scan retries once, then failed, old verdicts intact | `runScanJobRun > retries a failed scan once, then marks it failed with every old verdict intact, and records the attempt` (built on ticket 02's failed-tick count) | `expected '2026-11-24T12:00:00.000Z' to be '2026-11-25T12:00:00.000Z'` (the attempt was not recorded). The retry-once and verdicts-intact assertions passed at once: that rule is ticket 02's. Its red is the mutation `failedTicksPerScan` 2 -> 3: 2 tests red. |
| Engine: owner passes the project limit, stopped by the ceiling | `the app owner and the limits > passes the per-user project limit but is stopped by the daily AI ceiling like everyone else` | **Not seen red first.** Both rules existed from tickets 01 and 02; the test only puts them side by side. Red by mutation: 7 tests with the ceiling comparison changed, 6 with the ceiling check removed, and ticket 03's supervisor run for the owner exemption. |
| Add-attempt cap at its boundary, owner exemption | `mayAttemptAddProject > allows the 20th attempt of the day and refuses the 21st`; `> exempts the app owner`; `checkNewProject: add attempts are capped > refuses attempt number 21, makes no GitHub call, and says when the limit resets`; `> counts the attempt before the GitHub call is made` | `TypeError: mayAttemptAddProject is not a function`; `expected { ok: true, …(2) } to deeply equal { ok: false, …(2) }`; `expected [ 'GitHub call' ] to deeply equal [ 'record attempt', 'GitHub call' ]` |
| A repo-problem failure is not due again until the interval | `a failed scan keeps old verdicts > when the repo is the problem, the attempt is recorded: the project is not due again until the re-scan interval has passed` | `expected '2026-11-24T12:00:00.000Z' to be '2026-11-25T12:00:00.000Z'` |
| A stalled scan is marked failed | `isScanStalled > is stalled at 30 minutes without a sign of life, not a millisecond before`; `runScheduleTick: stalled scans > marks a full scan with no sign of life failed, with a reason, keeping its old results` | `TypeError: isScanStalled is not a function`; stub: `expected [] to deeply equal [ 'stuck' ]` |
| From ticket 03: stalled handling unblocks check and retry | `runScheduleTick: stalled scans > ends a stalled check as a failed check: the project is "done" again, and check and retry are accepted again`; `> marks a first scan that never left "queued" failed, which makes Retry possible` | Stub: `expected [] to deeply equal [ 'checking' ]`; `expected { defaultBranch: null, …(14) } to match object { scanStatus: 'failed', …(1) }` |
| A refused Releases request stores no verdict, spends no judge call | `a refused Releases request > stores no verdict and spends no judge call: the dependency is not read this time`; `> is tried again by the next scan ...` | `expected 1 to be +0` (a "no changelog" verdict had been stored); `expected [] to deeply equal [ 'express' ]` |
| From ticket 03: not paying twice | `a verdict is not paid for twice > when the verdict was stored but the write was reported as failed, the retried step uses the stored verdict`; `> when a scan resumes from an older checkpoint ...` | `expected [ 'express', 'express', 'chalk' ] to deeply equal [ 'express', 'chalk' ]`; `expected [ …(4) ] to have a length of 2 but got 4` |
| Browser: trigger the task directly, see a due project re-scan | `the scheduled task, triggered directly, re-scans a due project and leaves one that is not due` | **Partly.** The cron task, actions and engine existed when the spec was written; the page did not. Red then: `Error: the project has been scanned ... Received: null` (no `data-last-scan-at`). A red that is about the rule, by mutation on the finished code (the task enqueues nothing): `Expected: not "2026-11-23T22:11:52.735Z" Received: "2026-11-23T22:11:52.735Z"`. |
| Browser: scan now inside the cooldown shows the notice | `scan now inside the cooldown shows a notice with the time it returns; after the cooldown it scans` | **Partly**, same reason. Red before the page: the same `Received: null`. By mutation (the action skips its check): `expect(locator).toBeVisible() failed ... element(s) not found` for the notice. |

Other tests, same rule:

- Test first, red seen: `countDeferred` (`is not a function`); `nextUtcDayStart`;
  `dueTimeAfterOpening` (stub: `expected 'stub' to be '2026-11-23T12:00:00.000Z'`);
  `signs of life` (`expected null to be '2026-11-23T12:05:00.000Z'`); the 8 other
  `runScheduleTick` cases; the `attempts` schema (`Error: schema attempts is not
  registered`); `readReleasesAnswer` (7 red, `is not a function`); `src/cron.test.ts`
  (`expected [] to deeply equal [ { name: undefined, …(1) } ]`); the three fake-world
  repos (`expected [] to have a length of 17 but got +0`); the two review fixes
  (`Error: could not update project gone`; the "1 hour" wording).
- **Written after the code, red by mutation only:** the two tests named `daily AI
  ceiling ...: the second attempt is an AI call too` (`scan.test.ts`,
  `on-demand.test.ts`). My own mutation run found that removing the ceiling check before
  the retry attempt left every test green, a gap from ticket 01. With the check removed:
  `expected [ 'zod', 'zod' ] to deeply equal [ 'zod' ]` and `expected [ …(2) ] to have a
  length of 1 but got 2`.
- The other 11 browser tests were written before the page and run for the first time after
  it, so they have no "before" red. Five were then run red by mutation (below).
- Mutation runs on the finished code, each restored afterwards. Unit and engine, 29 run,
  all red after the two tests above were added: cooldown comparison; cooldown removed from
  the scan-now rule; due comparison; due filter removed; idle comparison; idle filter
  removed; bound removed; bound off by one; the tick passing its own large bound;
  attempt cap off by one; attempt owner exemption removed; attempt first check removed;
  attempt recount removed; attempt counted after GitHub; one-scan-at-a-time removed from
  the scan-now rule; and from the selection; stalled comparison; stalled check ignoring
  status; stalled scans never marked; ceiling first check removed; ceiling retry check
  removed; ceiling comparison; failed scan not recording the attempt; refused stored as
  "no changelog"; stored verdict not looked up; heartbeat not written; idle resume
  removed; failed ticks 2 -> 3; interval not hourly. Browser, 5 run, all red: cron route
  lock removed (Alice's trigger accepted); `scan-now` action skipping its check;
  `add-project` action counting no attempts; `record-opened` not making an idle project
  due; the task enqueuing nothing.

**Tests changed but not weakened**

- `src/core/limits.test.ts`, `isProjectDue` (ticket 01): inputs changed from
  `{ lastScanAt, now }` to `{ nextDueAt, now }`, with `nextDueTime` supplying the 24
  hours. Same boundary: due at 24 hours, not a millisecond before. One case added.
- `src/engine/add-project.test.ts` (ticket 02): every `checkNewProject` call gained the
  third argument (the attempts counter) and the request gained `now`. Expectations
  unchanged.
- `src/engine/tick.test.ts`: the hand-written store in one test gained `listProjects`.
- `src/schemas.test.ts`: the collection list gained `attempts`.
- The world helpers in `scan.test.ts` and `scan-job.test.ts` now seed `lastOpenedAt`, so
  the selection function can be used on their projects.

**Evidence** (`specs/bumpcheck/evidence/04/`)

All are the browser tests' own captures, copied from `test-results/captures/` after the
gate run below. `npx deepspace test screenshot` cannot sign in (ticket 02 found it reaches
only the "Sign in to continue" panel); I did not run it again for this ticket.

- `project-notice-cooldown.png`: "Scan now is cooling down", with the time it returns.
- `project-notice-scan-cap.png`: "The last scan stopped at its limit" (top of the page).
- `project-notice-scan-cap-whole-page.png`: the same page in full, 15 read and 2 "not
  read yet".
- `project-notice-daily-limit.png`: "The app's daily AI limit has been reached".
- `project-notice-scan-failed.png`: "The last scan failed", its reason, when it will be
  tried again, when Retry is available, and the Retry button.

**Left undone, unverified, or open**

- **A project waiting its turn in the job queue for over 30 minutes is treated as
  stalled.** The heartbeat is stamped when the row is queued and not again until its job
  starts, and jobs run one at a time. If that happens to a full scan it shows "failed",
  then corrects itself when its job runs. If it happens to a check, the request is
  cleared, the late job reads nothing, and the check is lost with only the "last check did
  not finish" notice. It needs more than 30 minutes of scans ahead in the queue (at most 5
  are enqueued per hour by the task). Not fixed: the job room is not readable in a way
  that tells "waiting" from "gone".
- **Two requests at the same instant** can still both pass a read-then-write check:
  two `scan-now` calls (two full scans of one project; the page's button is disabled
  while a request is in flight, so this needs the API), `scan-now` at the moment the
  hourly task queues the same project, and ticket 03's two-checks case. Nothing extra is
  judged twice (verdicts are cached), but GitHub and npm are read twice.
- **Two add attempts at the same instant at the cap's edge are both refused**, each
  having counted the other. Conservative, same as the project limit.
- **`attempts` rows are never deleted.** At most about 20 rows per user per day. A
  delete of old days could go in the hourly task.
- **A refused Releases request is asked again on every scan, with no bound.** Each time
  costs one paid GitHub call (the CHANGELOG.md read that comes first) per affected major.
  If the unauthenticated Releases API is refused often from the platform's network (the
  spec lists this as unverified), a project with many releases-only majors pays that
  daily. For the supervisor to weigh at the live check.
- **A verdict whose own record write truly fails** (nothing stored) is still paid for
  again on the retried step. The AI call was counted, so the ceiling still holds.
- **Stalled-scan marking is engine-tested only**, not driven in a browser test (it would
  need a test hook that sets a project's status).
- The page's cooldown notice stays until the next press, even after the cooldown ends.
- The real GitHub Releases status codes (403 or 429 for the rate limit) are as documented
  by GitHub, not observed. The real services were not called. The live check was not run.
- `listProjects` loads every project row on each hourly run. Fine at this size.
- The first gate run for this ticket's browser spec stopped before any test with
  `Failed to refresh app secrets: internal error [secrets_refresh_failed]` from the CLI.
  It passed on rerun with no code change. This is a third pre-test flake, not one of the
  two already known.
- The gate output below is from the final code tree. The only changes after it are this
  note, the Status line and the evidence images.

**Noticed outside this ticket** (not changed)

- The local test server's record room keeps projects between runs, and the scheduled task
  runs once when the server starts. Projects left by a spec are due a day later and get
  scanned (against the fakes) while the next day's first test starts. `scheduling.spec.ts`
  ends with a test that empties both accounts, and it is the last spec in the gate, so a
  completed gate leaves nothing. A run of another spec on its own, or an aborted run,
  still leaves rows.
- `isNotFound` in `src/services/github-source-host.ts` (ticket 02) matches any error text
  containing "not found" or "404". An integration error such as "Connection not found"
  would be read as "the repository was not found", and for a changelog read would store a
  shared "no changelog found". Worth checking against the real error shapes at the live
  check.
- `add-project` does not check the result of `tools.remove` when it takes back a row that
  went over the project limit.

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


 Test Files  21 passed (21)
      Tests  439 passed (439)
   Start at  03:03:49
   Duration  1.83s (transform 2.49s, setup 0ms, import 7.10s, tests 857ms, environment 4ms)


> bumpcheck@0.0.1 test:smoke
> deepspace test run smoke

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:04:02 AM [generouted] scanned 7 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 40ms
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5107 ms
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

  ✓  1 tests/smoke.spec.ts:21:3 › Smoke tests › static landing loads without JS errors (904ms)
  ✓  2 tests/smoke.spec.ts:29:3 › Smoke tests › landing carries one title, one description, one canonical (403ms)
  ✓  3 tests/smoke.spec.ts:40:3 › Smoke tests › static contract: landing fires no auth request, opens no websocket (1.9s)
  ✓  4 tests/smoke.spec.ts:55:3 › Smoke tests › dynamic app boundary mounts on /home (508ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  5 tests/smoke.spec.ts:60:3 › Smoke tests › sign-in button visible when logged out (557ms)
  ✓  6 tests/smoke.spec.ts:66:3 › Smoke tests › unknown route shows 404 (402ms)

  6 passed (13.7s)

> bumpcheck@0.0.1 test:api
> deepspace test run api

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:04:19 AM [generouted] scanned 7 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5115 ms
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

  ✓  1 tests/api.spec.ts:4:3 › API tests › auth proxy forwards to auth worker (187ms)
  ✓  2 tests/api.spec.ts:9:3 › API tests › WebSocket endpoint exists (1.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  2 passed (9.8s)

> bumpcheck@0.0.1 test:signed-in
> deepspace test run tests/projects.spec.ts && deepspace test run tests/project-page.spec.ts && deepspace test run tests/scheduling.spec.ts

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:04:32 AM [generouted] scanned 7 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4889 ms
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
  ✓   1 tests/projects.spec.ts:73:1 › the projects list starts empty, a project is added, and its first scan finishes while watching (4.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   2 tests/projects.spec.ts:105:1 › adding the same repo twice is refused with its own message (2.1s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   3 tests/projects.spec.ts:119:1 › the project limit is reported, and nothing is added past it (2.8s)
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
  ✓   5 tests/projects.spec.ts:156:1 › a repo that cannot be scanned is refused with the reason, inline (2.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
  ✓   6 tests/projects.spec.ts:178:1 › one user's projects are not in another user's list (3.2s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   7 tests/projects.spec.ts:193:1 › an action needs a verified sign-in: no token, no project (47ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/projects.spec.ts:205:3 › the job room is locked down › a member cannot enqueue a job, and cannot read the queue (4.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/projects.spec.ts:228:3 › the job room is locked down › a signed-out visitor cannot enqueue a job either (2.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/projects.spec.ts:239:1 › a signed-in member cannot call an owner-billed integration from the browser (563ms)

  10 passed (34.6s)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 3:05:09 AM [generouted] scanned 7 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4851 ms
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
  ✓   2 tests/project-page.spec.ts:167:1 › a verdict is marked as reviewed, moves to the collapsed section, and undo brings it back (3.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   3 tests/project-page.spec.ts:207:1 › the server refuses to review a verdict that is not in the project, or a failed one (4.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
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
[WebServer] [action] "mark-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "undo-reviewed" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   5 tests/project-page.spec.ts:251:1 › the projects list shows each project's count of unreviewed breaking upgrades (3.0s)
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   6 tests/project-page.spec.ts:277:1 › Bob cannot see Alice's private project by URL, and cannot act on it (8.0s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   7 tests/project-page.spec.ts:324:1 › "check this one" reads only that dependency, and progress shows while it runs (6.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "retry-verdict" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/project-page.spec.ts:372:1 › a second request while a check is running is refused: one scan at a time (4.9s)
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
  ✓   9 tests/project-page.spec.ts:389:1 › a verdict read from a later version is not shown to a project on an older one, until its own check reads the wider range (9.2s)
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
  ✓  11 tests/project-page.spec.ts:447:1 › a failed verdict has a retry button, and retrying judges that verdict again (3.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  12 tests/project-page.spec.ts:484:1 › scan progress is shown live while the first scan runs (6.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  13 tests/project-page.spec.ts:505:1 › a project with no dependencies shows an empty state, not an empty page (2.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
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
[WebServer] 3:06:31 AM [generouted] scanned 7 routes in 9 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4906 ms
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
[WebServer] [cron] daily-scans ok 6ms
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 26ms
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 6ms
  ✓   1 tests/scheduling.spec.ts:132:1 › the scheduled task, triggered directly, re-scans a due project and leaves one that is not due (8.9s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 5ms
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 35ms
  ✓   2 tests/scheduling.spec.ts:163:1 › an idle project is not scanned until its owner opens it again (7.3s)
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
  ✓   3 tests/scheduling.spec.ts:194:1 › scan now inside the cooldown shows a notice with the time it returns; after the cooldown it scans (4.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "scan-now" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   4 tests/scheduling.spec.ts:236:1 › scan now is refused while a scan is running: one scan at a time (6.8s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 26ms
  ✓   5 tests/scheduling.spec.ts:260:1 › a scan that stops at its limit says so, and a later scan reads the rest (4.8s)
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
[WebServer] [cron] daily-scans ok 21ms
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   6 tests/scheduling.spec.ts:293:1 › the app's daily AI limit stops the judge on every path, and the page says it is a limit (4.6s)
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
  ✓   8 tests/scheduling.spec.ts:377:1 › an upgrade whose release notes GitHub refused is shown as not read this time, with no verdict (2.2s)
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
  ✓   9 tests/scheduling.spec.ts:393:1 › add-project attempts are capped per user per day, and the refusal says when the cap resets (10.4s)
  ✓  10 tests/scheduling.spec.ts:426:3 › the cron room is locked down › a member cannot trigger, pause or resume the scheduled task (4.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  11 tests/scheduling.spec.ts:433:3 › the cron room is locked down › a signed-out visitor cannot either (3.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  12 tests/scheduling.spec.ts:439:3 › the cron room is locked down › the test-only trigger is not an open door: it needs a sign-in (12ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  13 tests/scheduling.spec.ts:445:1 › nothing is left behind for the next run of the scheduled task (2.2s)

  13 passed (1.4m)
```

**Supervisor note (2026-11-24).** Verified and accepted. Gate green on my own run (439 unit and
engine, 6 smoke, 2 API, 37 signed-in). Mutation check, my own, nine rules, each turned a test
red: cooldown, add-attempt cap, stall time and due time off by one; schedule ignoring idle,
picking active scans, ignoring its bound; scan now allowed while scanning; cron room open to
members (browser). All four notice screenshots looked at.

Open after this ticket, none blocking: a job waiting in the queue over 30 minutes looks
stalled; two scan-now requests at the same instant can both enqueue; a refused Releases
request costs one paid GitHub call per affected major on every scan; `isNotFound` in
`src/services/github-source-host.ts` matches any error text containing "not found", which
needs the live check's real error shapes before it can be tightened safely; the scheduled
task runs once right after it is first armed (after a deploy's first request).
