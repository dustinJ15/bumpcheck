# 06 — Email alerts

**Status:** done

**Who:** worker · **Changes a page:** yes · **Blocked by:** 05
**Stories:** 37–46, 51 · **Decisions:** 10, 11, 14, 17

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

Email alerts are a primary feature (ledger A.9), not a cut candidate. This is the largest
ticket; work it in the order below so each part is tested before the next starts.

## Goal

A user who opts in gets one useful email when a new breaking upgrade appears, never the same
news twice, and can leave with one click.

## Build

1. **Alert composer** (pure). A project plus its not-yet-alerted breaking verdicts in; subject,
   HTML body, text body and headers out, or nothing when there is nothing to send. The subject
   names the repo and the count. The body lists each package, the version jump, the summary and
   the first "what to do" note. The text body carries the same content as the HTML. Headers
   include `List-Unsubscribe`. Rendered by code from stored verdicts; no AI.
2. **Unsubscribe tokens** (pure). Sign and verify a token naming one project. The key is passed
   in as an argument; the module never reads env itself.
3. **Alert step.** Replaces ticket 01's no-op hook. After a daily scan, for a project with
   alerts on: collect breaking verdicts that are neither reviewed nor already alerted for this
   project; if any, compose, send, log the outcome, and record which verdicts were alerted. At
   most one alert email per project per day. A failed send is retried once on the next scan,
   then left as failed. Never runs for an on-demand scan.
4. **Real mailer:** the email integration, owner-billed, recipient is the sign-in address,
   with reply-to and headers passed through. Write and type-check it; do not call it.
5. **Unsubscribe route** (`src/server/http-routes.ts`): public, no sign-in. Verifies the signed
   token, turns alerts off for that one project, shows a confirmation page. It can do nothing
   else. A bad or tampered token gets a plain error page. The worker passes
   `env.UNSUBSCRIBE_SIGNING_KEY` to the token module; the key is never logged or sent to the
   browser.
6. **Server actions:** set a project's alert setting (off by default); send a test email (3 per
   user per day, logged as kind "test"); delete a project, which removes it and its alert log
   and leaves shared verdicts.
   **From ticket 05:** deleting a public project must also remove its public report
   (`src/server/public-report.ts`), or the report stays readable at its share link. Test it:
   after delete, the share link shows "not available".
7. **Project settings page:** alert switch, "send me a test" button with its remaining count,
   the send log (time, kind, outcome, failure reason), and delete with a confirmation. The
   public switch from ticket 05 stays.
8. **Live check:** add the one real test email to `npm run live-check`. Write it; do not run it.

## Tests required

- Unit: composer content, nothing-to-send, HTML and text parity, subject format; token round
  trip, tampering, wrong project.
- Engine, with the fake mailer: an alert is sent once and never repeated; reviewed verdicts
  are not alerted; on-demand reads don't alert; alerts off sends nothing; a failed send
  retries once then stays failed; no second alert the same day.
- Browser: settings toggles persist across reload; a test send appears in the log (fake
  mailer); the fourth test send in a day is refused; the unsubscribe link turns alerts off
  while signed out; delete removes the project and frees a slot.

## Supervisor step after this ticket (not worker work)

The supervisor or Dustin runs `npm run live-check`, reads the real email in a mail client, and
confirms whether the `List-Unsubscribe` header arrived.

## Done means

Acceptance: the behaviours above hold against the fakes; no test sends real mail; the gate is
green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and
screenshots from `npx deepspace test screenshot` of the settings page (alerts on, with a send
log) and the unsubscribe confirmation page, saved under `specs/bumpcheck/evidence/06/`. Also
attach the composer's HTML and text output for one sample alert as files in the same folder.

## Completion

Completed 2026-11-24 on `ralph/bumpcheck`.

**What was built**

- Pure (`src/core/`, no `deepspace` import), each with tests beside it:
  - `alert-email.ts`: the composer. `composeAlertEmail` turns a project, the items to show, the
    app's origin and the signed unsubscribe link into subject, HTML, text and headers, or null
    when there is nothing to send. One function (`wordsFor`) holds every sentence; `renderText`
    and `renderHtml` only lay those words out, so the two bodies cannot drift.
  - `alert-rules.ts`: which verdicts an alert may cover (`pickAlertItems`), what a test email
    shows (`pickTestItems`), and the three readings of the send log (`alreadyAlertedKeys`,
    `failedSendsOf`, `alertsSentOn`).
  - `unsubscribe-token.ts`: `signUnsubscribeToken`, `verifyUnsubscribeToken`, `unsubscribeUrl`.
    HMAC-SHA256 over the project id, key passed as an argument.
  - `unsubscribe-page.ts`: the plain HTML pages the route answers with.
  - `app-origin.ts`: `appOrigin(env)`, where email links point.
  - `limits.ts` gained `maySendTestEmail`, `testEmailsLeft`, `mayAlertToday`,
    `mayTryAlertAgain`, `waitUntilNextUtcDay`. `model.ts` gained `AlertLogEntry`.
- Engine (`src/engine/alert.ts`, no `deepspace` import): `runAlertStep` (the alert step),
  `alertHookFor` (what the scan engine's hook is wired to), `sendTestEmail`.
- Interfaces (`src/services/types.ts`): `AlertStore`; `ProjectRecord` gained `reviewedKeys`,
  `alertsEnabled`, `alertedKeys`; `MailMessage` gained an optional `replyTo`. Fakes follow
  (`fakes.ts`: `FakeMailer` can answer per message, `MemoryRecordStore` implements `AlertStore`).
- Real services: `src/services/email-mailer.ts` (the email integration; **written and
  type-checked, never called**), `record-room-store.ts` (implements `AlertStore`),
  `src/services/outbox-mailer.ts` (the fake the local test server uses), `wire.ts`
  (`buildAlertServices`; the scan job's `alertHook` is now the real step).
- Server: `src/server/unsubscribe.ts` (the route's logic), `registerUnsubscribeRoute` in
  `src/server/http-routes.ts` (registered in `worker.ts`), `src/server/delete-project.ts`.
- Actions (`src/actions/`): `set-alerts`, `send-test-email`, `test-email-allowance`
  (`alerts.ts`), `delete-project` (`delete-project.ts`). Test-only: `test-read-outbox`;
  `test-reset-my-projects` now also clears the caller's send log, counted attempts and fake mail.
- Schemas: new server-only `outbox`; `attempts` gained a `kind` column (`add-project` or
  `test-email`).
- Config (`src/config.ts`): `LIMITS.alertSendAttemptsPerVerdict` 2, and
  `ALERT_EMAIL.replyTo` (null).
- Page: `src/pages/(app)/(protected)/projects/[id]/settings.tsx` gained the alerts section
  (switch, "Send me a test" with the count left, send log) and delete with a confirmation. The
  public switch is unchanged.
- Live check: `tests/live/live-check.live.ts` sends one real test email after the scan, prints
  the outcome and the send-log line, then deletes the project. **Written, not run.**
- Gate: `tests/alerts.spec.ts` (9 browser tests) added to `npm run test:signed-in`, before
  `scheduling.spec.ts`, which stays last.

**Supervisor decision recorded here (2026-11-24): what the unsubscribe link does.** GET shows a
confirmation page with one button and changes nothing. The button's POST, and a mail client's
own one-click POST (RFC 8058, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`), both turn
alerts off. That is one click for a person, and a mail scanner that opens the link
unsubscribes nobody. Both POSTs go to the same URL, the one in the `List-Unsubscribe` header.

**Where the recipient address comes from.** From the platform's own `users` collection, read
on the server: `RecordRoomStore.getUserEmail(userId)` does `tools.get('users', <user id>)` and
takes `email`. Checked in the installed `deepspace` 0.44.2 (`dist/worker.js`): the record room
keeps one `users` row per user with the user id as the row id; `registerUser` fills `email`
from the verified sign-in claims every time that user's socket connects; and a record write
that tries to change `email` is refused (`SYSTEM_ASSIGNED_COLUMNS`), so a client cannot alter
it. The scheduled alert runs as the app owner and reads the row of `project.userId`; the test
email reads the row of the verified caller. Nothing is stored on the project row, in the send
log or in `publicReports`, and no action takes an address (a browser test sends `to`, `email`
and `userId` in the request and the mail still goes to the caller's own address).
`src/schemas.test.ts` checks that no client-readable bumpcheck collection has an address column.

**How "never twice" is enforced.** A verdict counts as already alerted if either of two
records says so: the project row's `alertedKeys`, or a line in the send log with kind "alert"
and outcome "sent" that lists it (`alreadyAlertedKeys`). After a successful send both are
written, each attempted even if the other fails, and neither failure is thrown (throwing
would make the job run the step again and send again). Each record has its own test: the log
write fails and the next scan sends nothing; the project write fails and the next scan sends
nothing. If the send log cannot be read at all, nothing is sent.

**How "one per day" is enforced.** Before sending, the step counts this project's log lines of
kind "alert" with outcome "sent" on the current UTC day (`alertsSentOn`) and stops at
`LIMITS.alertEmailsPerProjectPerDay` (`mayAlertToday`). The verdicts stay unalerted, so the
next day's scan sends them. Test emails and failed sends do not count.

**How "retried once, then left as failed" is enforced.** A failed send writes a "failed" log
line and marks nothing as alerted, so the next full scan picks the verdict again. A verdict
that appears in `LIMITS.alertSendAttemptsPerVerdict` (2) failed alert lines is left out from
then on (`failedSendsOf`, `mayTryAlertAgain`). The count is per verdict, so a newer verdict is
not held back by an older one that was given up on.

**How the unsubscribe route fails closed.** `registerUnsubscribeRoute` passes
`c.env.UNSUBSCRIBE_SIGNING_KEY` as it is to `handleUnsubscribe`. With no key (undefined or
empty) that function answers 503 before it looks at the token or touches a record;
`verifyUnsubscribeToken` and `signUnsubscribeToken` also refuse an empty key on their own.
With a key, a token that does not verify gets 400 before any record is read. The only write
the route can make is `{ alertsEnabled: false }` on the project the verified token names. On
the sending side the same holds: with no key, or no known app origin, or no sign-in address,
no email is sent and the attempt is logged as failed with the reason. There is no default key
anywhere; `src/services/wire.test.ts` and `src/server/unsubscribe-route.test.ts` each have a
test that goes red if one is added.

**Where the app's origin comes from** (`src/core/app-origin.ts`). Configuration, because the
alert is composed in a job with no request: `https://<APP_NAME>.app.space` (`APP_NAME` is a
worker var in `wrangler.toml`), or `BUMPCHECK_APP_ORIGIN` when present. `vite.config.ts` sets
that one to the local server's own address (`http://127.0.0.1:<DEEPSPACE_PORT>`) only when
vite is serving; a build never gets it (tested the same way as the fake-services setting).
With no usable app name the origin is null and nothing is sent.

**Platform facts checked against the installed `deepspace` 0.44.2**

- Email integration, from `npx deepspace integrations info email/send --json` (read-only): one
  endpoint, `email/send`, $0.013 per request. Input: `to` and `subject` required; `from`,
  `html`, `text`, `reply_to`, `cc`, `bcc`, `headers` (string to string) accepted. The catalog
  text says it sends from "DeepSpace Apps <notifications@updates.app.space>" and that any
  `from` is ignored. All as the spec says. `outputSchema` is null, so the real mailer reads
  only success or failure.
- The local test server does have the `UNSUBSCRIBE_SIGNING_KEY` binding: the browser tests
  follow unsubscribe links the app signed, and they verify. No test, and not I, read the key.
- `users` rows: see "Where the recipient address comes from".

**Judgment calls (please confirm)**

- **Test emails are counted in `attempts`, not from the send log.** The send log is deleted
  with its project, so counting from it would let a user reset the allowance by deleting and
  re-adding a project (each cycle three more paid emails). `attempts` gained a `kind` column
  for this; add-project rows now carry `kind: 'add-project'`. A browser test deletes and
  re-adds and is still refused.
- **A test email that fails to send still uses one of the three.** The attempt may have been
  billed.
- **The fourth press is refused by the server and the page shows the reason**; the button is
  not disabled at zero (same approach as "scan now" in its cooldown).
- **A test email is sent whether alerts are on or off**, shows the project's unreviewed
  breaking upgrades whether or not they were alerted before, and never marks anything as
  alerted. A project with nothing breaking gets a built-in example, labelled as made up.
- **The first alert after switching on covers every unreviewed breaking verdict the project
  already has**, not only ones found later. That is the spec's rule read literally ("neither
  reviewed nor already alerted"). The subject says "new", meaning new to the inbox.
- **An alert that cannot be sent safely (no key, no origin, no address) is logged as a failed
  send**, so it shows in the user's log, but the line names no verdict and so does not count
  toward "retry once": when the setup is fixed, the alert goes out. (Changed after the code
  review; at first two such scans gave the verdicts up for good.)
- **Reply-to:** the app has no address for replies, so none is set (`ALERT_EMAIL.replyTo` is
  null in `src/config.ts`; set it and the real mailer passes `reply_to`).
- **Headers:** exactly `List-Unsubscribe` and `List-Unsubscribe-Post`. Nothing else was added.
- **The text body is not hard-wrapped.** A long summary is one long line; mail clients wrap it.
- **Delete order:** the project is set private and its public report removed first, then the
  send log, then the row, so no failure can leave a deleted project readable at its link.
- **A second server-only collection, `outbox`,** exists only so the fake mailer has somewhere
  to write that a browser test can read back. In production nothing writes to it.
- The settings page shows the user their own sign-in address (from `useUser()`), so they know
  where alerts go, and says that daily scans, and so alerts, pause after 7 idle days.
- `/api/unsubscribe` is under `/api/` because that prefix already reaches the worker first in
  local dev and production (`run_worker_first`).

**Red/green log** (rule 12)

Every unit and engine test below was written and run red before its code. "Stub" means the
functions existed with a constant return value, so the red is an assertion and not a missing
import.

| Required test | Test name | Red result |
|---|---|---|
| Unit: composer content | `composeAlertEmail: content > lists each package with its version jump, summary and first "what to do" note` (and 9 more in that block) | Stub: `expected '' to contain 'router'`; `expected [] to include 'https://bumpcheck.example/projects/pr…'` |
| Unit: nothing-to-send | `composeAlertEmail: nothing to send > returns null when there are no verdicts to tell the user about` | Stub: `expected { subject: '', html: '', …(3) } to be null` |
| Unit: HTML and text parity | `composeAlertEmail: HTML and text carry the same content > an alert: every piece of the text body is in the HTML, and every link`; `> an alert: everything the HTML shows is in the text body, and every link` (and the same pair for a test email and for the example) | Stub: `expected 0 to be greater than 8`. Against the first real version: `missing from the text body: &nbsp;&middot;&nbsp;` (a decoration in the HTML that the text did not have; removed) |
| Unit: subject format | `composeAlertEmail: subject > names the repo and the count`; `> uses the singular for one`; `> cannot be used to add a header: line breaks in the repo name are removed` | Stub: `expected '' to be 'bumpcheck: 2 new breaking upgrades in…'` |
| Unit: hostile input (supervisor's brief) | `composeAlertEmail: untrusted text > escapes every dynamic value in the HTML` | Stub: `expected '' to contain '&lt;img src=x onerror=alert(1)&gt;'` |
| Unit: token round trip | `unsubscribe tokens > round trip: a signed token verifies and names its project` | **Passed against the stub** (the stub echoed its input). Red by mutation (the signature made over a constant): `expected { ok: false } to deeply equal { ok: true, projectId: 'project-1' }` |
| Unit: token tampering | `unsubscribe tokens > tampering: changing any character of the signature is refused` | Stub: `TypeError: Cannot read properties of undefined (reading 'length')`. By mutation (signature not checked): `character 0: expected { ok: true, projectId: 'project-1' } to deeply equal { ok: false }` |
| Unit: token for the wrong project | `unsubscribe tokens > wrong project: one project's signature does not unsubscribe another` | Stub: `expected { ok: true, …(1) } to deeply equal { ok: false }` |
| Engine: sent once, never repeated | `never the same news twice > an alert is sent once and never repeated by later scans`; `> is not repeated when the send log could not be written: the project row remembers`; `> is not repeated when the project row could not be updated: the send log remembers` | Stub: `expected [] to have a length of 1 but got +0`. About the rule, by mutation (both records ignored): `expected [ { …(5) }, { …(5) }, { …(5) }, …(1) ] to have a length of 1 but got 4` |
| Engine: reviewed verdicts are not alerted | `what is not alerted > reviewed verdicts are not alerted` | Stub: `expected [] to have a length of 1 but got +0`. By mutation: `expected 'bumpcheck: 2 new breaking upgrades in…' to be 'bumpcheck: 1 new breaking upgrade in …'` |
| Engine: on-demand reads don't alert | `what is not alerted > on-demand reads do not alert, even with breaking verdicts waiting` | Stub: `expected [] to have a length of 1 but got +0` (its last line, the next daily scan). About the rule, by mutation (`scan.ts` calls the hook for on-demand scans too): `expected [ { to: 'dustin@example.test', …(4) } ] to have a length of +0 but got 1` |
| Engine: alerts off sends nothing | `what is not alerted > alerts off sends nothing and logs nothing` | **Passed against the stub** (it sent nothing). Red by mutation (the check removed): 7 tests red, first `expected 'bumpcheck: 2 new breaking upgrades in…' to be 'bumpcheck: 1 new breaking upgrade in …'` |
| Engine: a failed send retries once then stays failed | `a failed send > retries once on the next scan, then stays failed` | Stub: `expected [] to have a length of 2 but got +0`. By mutation (off by one, both ways): `to have a length of 2 but got 1`; `to have a length of 2 but got 3` |
| Engine: no second alert the same day | `at most one alert email per project per day > no second alert the same day; the new verdict goes out with the next day's scan` | Stub: `expected [] to have a length of 1 but got +0`. By mutation (rule removed): `expected [ { …(5) }, { …(5) } ] to have a length of 1 but got 2` |
| Browser: settings toggles persist across reload | `alerts are off by default; the settings toggles persist across a reload` | **Not seen red before the code:** all nine browser tests were written after the page and actions existed. By mutation (`set-alerts` stores nothing): `Locator: getByRole('switch', { name: 'Email alerts' }) Expected: "true" Received: "false"` |
| Browser: a test send appears in the log; the fourth is refused | `a test send appears in the log, and the fourth test send in a day is refused` | By mutation (the action counts nothing): `Locator: getByTestId('test-emails-left') Expected: "2 of 3 test emails left today." Received: "3 of 3 test emails left today."` |
| Browser: the unsubscribe link turns alerts off while signed out | `the unsubscribe link turns alerts off while signed out: the page asks once, and one click does it`; `a mail client's one-click POST unsubscribes without a sign-in, and only the project the link names` | By mutation (POST writes nothing): `Locator: getByRole('switch', { name: 'Email alerts' }) Expected: "false" Received: "true"`. By mutation (GET turns alerts off): `Expected: "Stop alert emails for bumpcheck-fake/demo?" Received: "Alert emails for bumpcheck-fake/demo are off."` |
| Browser: delete removes the project and frees a slot (and, from ticket 05, the share link shows "not available") | `delete removes the project, its send log and its public report, and frees a slot` | By mutation (delete skips the public report): `Locator: getByTestId('public-report-not-available') Expected: visible ... element(s) not found` |

Other tests, same rule:

- Test first, red seen: the limit rules (`TypeError: maySendTestEmail is not a function`, and
  the same for `testEmailsLeft`, `mayAlertToday`, `mayTryAlertAgain`, `waitUntilNextUtcDay`);
  `alert-rules.test.ts` (14 of 16 red against a stub, e.g. `expected [] to deeply equal
  [ 'chalk' ]`); `app-origin.test.ts` (9 red, e.g. `expected 'http://localhost' to be
  'https://bumpcheck.app.space'`); the 36 other engine tests in `alert.test.ts` (e.g.
  `expected { ok: false, remaining: null } to deeply equal { ok: true, remaining: 2 }`);
  `src/server/unsubscribe.test.ts` (15 of 16 red against a stub that trusted its input, e.g.
  `expected 200 to be 503`); `src/server/delete-project.test.ts` (9 of 10 red, e.g.
  `expected [ 'a1', 'a2', 'a3', 'a4', 'a5' ] to deeply equal [ 'a4', 'a5' ]`); the real
  mailer's helpers (`expected [ 'from' ] to not include 'from'`); the schema tests (`Error:
  schema outbox is not registered`); the sample-email snapshot (`sample-alert.html exists:
  expected false to be true`).
- **Written after the code, red by mutation only:** `src/server/unsubscribe-route.test.ts`
  (7 mutations of the route, all red, e.g. a default key when the env has none: `expected 400
  to be 503`) and `src/services/wire.test.ts` (4 mutations, e.g. `expected 'dev-key' to be
  undefined`). I added both when I saw that nothing would go red if the worker handed the
  route or the alert step a made-up key.
- **Three tests added after the code review**, each red before its fix: untrusted text
  starting a line of its own in the text body (`expected [ …(4) ] to have a length of 1 but
  got 4`); a setup problem using up the retry (`expected [ [ 'failed', …(1) ], …(1) ] to
  deeply equal [ [ 'failed', [] ], …(3) ]`). The third, the alert switch staying disabled
  after an unsubscribe, **I could not get red**: the browser test I wrote for it passed before
  the fix as well. The fix is in (both switches clear their pending request once the row
  matches) and the test stays, but it does not prove the fix.
- Four tests passed against their stub because they assert an absence (`a changelog link
  cannot break out of its attribute`, `leaves out a changelog link that is not http or https`,
  `loads nothing from anywhere`, `a test email carries the same headers`). Each has a mutation
  below that turns it red.
- My first mutation run left 4 of 76 green. For each I added a test or corrected a mutation
  that had changed nothing: link targets not escaped (new test `writes an ampersand in a link
  target as an entity, in every kind of link`); a test email using the alert history (new
  test `shows the project's breaking upgrades even after an alert has gone out for them`);
  "failed send recorded as alerted" and "default key" (my mutations were in dead positions;
  corrected, both red).
- Mutation runs on the finished code, each restored afterwards. **Unit and engine: 90, all
  red.** By rule: alerting a reviewed verdict; alerting twice (project row ignored; send log
  ignored; both ignored; alerted keys never written; overwritten; log never written; log
  failure thrown after a send); test emails or failed alerts counted as alerted; alerting on
  an on-demand scan; alerts-off check removed; non-breaking verdicts alerted; one per day
  (rule removed; off by one; counting failed sends; counting test emails; ignoring the day;
  config 1 -> 2); retry once (rule removed; off by one both ways; config 2 -> 3; setup
  problems counted as tries; real failures not counted); test-send cap (first check removed;
  recount removed; off by one; owner not exempt; counted after sending; config 3 -> 4); token
  (signature not checked; empty key accepted; signature over a constant; route and handler
  without the key check; default key in the handler, the route, the engine and the wiring;
  token not verified; key coerced to a string); another project's token; the route's write
  (GET writing; more than the setting; turning alerts on; a failed write reported as done;
  POST handled as GET); HTML escaping (escape function; summary; package name; link targets;
  the unsubscribe page; any URL scheme; header and subject line breaks; summary line breaks;
  an external image); delete (public report left; not made private first; send log kept; all
  the user's logs deleted; log not scoped to the caller; one batch only; row kept; verdicts
  deleted); the real mailer (naming a sender; dropping the headers; reading a failure as
  sent); the origin (forwarded by a build; hard-coded fallback in three places); the fake
  mailer wired as the default; the real mailer wired in fake mode; outbox readable by members.
  **Browser: 9, all red:** the ownership check bypassed in `set-alerts`, in `send-test-email`
  and in `delete-project` (one run each; `Expected "code": "project-not-found"`); delete
  leaving the public report; unsubscribe GET turning alerts off; test emails not counted;
  the scan job wired to no alert step; unsubscribe POST writing nothing; `set-alerts` storing
  nothing.

**Tests changed, none weakened**

- `src/schemas.test.ts`: the collection list gained `outbox`; the `attempts` test now also
  expects the `kind` column to be fixed.
- `tests/sharing.spec.ts`: `askRecordRoom`, `WireRecord` and `RECORD_ROOM` moved, unchanged,
  to `tests/helpers/app.ts`, so the new spec can use them.
- My own test `a verdict whose alert failed once is picked again` first expected the order
  `['zod', 'chalk']`; the report sorts by name, so it now expects `['chalk', 'zod']`.
- My own helper in `unsubscribe.test.ts` could not pass "no key" (a default parameter
  swallowed `undefined`); fixed, and the fail-closed test then went from red to green.

**Evidence** (`specs/bumpcheck/evidence/06/`)

Taken with `npx deepspace test screenshot` (signed-out pages). As in ticket 05 the command is
run from inside the spec when `BUMPCHECK_EVIDENCE` is set, because the page needs a link that
exists only while the spec runs; a normal gate run does not take them:

- `unsubscribe-confirm.png`: the confirmation page a signed-out visitor gets from the link.
- `unsubscribe-already-off.png`: the same link opened again after unsubscribing.

The browser tests' own captures:

- `settings-alerts-on-with-log.png`: settings, alerts on, with an alert in the send log
  (signed in as Alice; the screenshot command cannot sign in).
- `settings-send-failed.png`: a failed test send, its reason on the page and in the log.
- `settings-delete-confirm.png`: the delete confirmation.
- `unsubscribe-done.png`: the page after the one click. (A POST, so the screenshot command
  cannot reach it.)
- `unsubscribe-invalid.png`: the error page for a bad link.

The composer's output for one sample alert, from fixture data and a throwaway key. They are
vitest file snapshots (`src/core/alert-email.sample.test.ts`), so the gate fails if the
composer stops producing exactly these files:

- `sample-alert.html`, `sample-alert.txt`, `sample-alert.headers.txt` (subject and headers).
- `sample-alert-light.png`, `sample-alert-dark.png`, `sample-alert-narrow.png` (380 px): the
  HTML drawn by Chromium in each colour scheme, by a one-off script. A browser, not a mail
  client.

**Left undone, unverified, or open**

- **No real email has been sent.** The real mailer and the live check's email step are
  written and type-checked only. Unverified until the live check: that the integration
  accepts both `html` and `text` and sends them as alternatives; that it passes
  `List-Unsubscribe` and `List-Unsubscribe-Post` through (the spec already lists this as
  unverified); what its reply looks like (`outputSchema` is null); how the email looks in
  Gmail, Outlook and Apple Mail (only Chromium has drawn it).
- **The live check cannot show the email in a mail client.** It runs as the Alice test
  account, whose sign-in address ends in `@deepspace.test` and has no inbox, and the app
  sends only to the sign-in address. The live check proves the integration took the message
  and what it cost. To read one and check the header, Dustin has to sign in as himself and
  press "Send me a test" (locally with real services, or after the deploy). The send may also
  be reported as failed by the provider because of that address.
- **The alert switch staying disabled after an unsubscribe** (code review finding): fixed by
  reading the code, not reproduced. See the Red/green log.
- **Two test-email requests at the same instant at the cap's edge are both refused and both
  counted**, so the user ends the day one email short. Same conservative shape as the
  add-attempt cap.
- **A project deleted while its scan is in the alert step** can still get that one email, and
  its send-log line is written after the delete and never removed. The window is the
  duration of one send.
- **`attempts` and `outbox` rows are never pruned.** `attempts` grows by at most a few rows
  per user per day; `outbox` is written only by the fake mailer.
- **The failure path of each action** (a record write failing) has no browser test: the local
  record room cannot be made to fail. `deleteProjectRecords` and `handleUnsubscribe` have
  those paths unit-tested; `set-alerts` does not.
- Not driven by a test: the send log's loading and error states; the error panel under the
  alert switch; the "no daily limit for the app owner" wording (the test accounts are not
  the owner).
- `alertedKeys` is never pruned. The send log is read in full on every alert step.
- `spec.md` is not edited: it does not yet mention the `kind` column on `attempts`, the
  `outbox` collection, or where the app's origin comes from.
- The real services were not called. The live check was not run.
- The gate output below is from the final code tree. The only changes after it are this
  note and the Status line.

**Noticed outside this ticket** (not changed, except where said)

- **Idle pause and alerts work against each other.** Daily scans stop when the owner has not
  opened the project for 7 days (decision 9). A user who relies on email does not open the
  project, so unless a breaking upgrade appears (and they click through) within 7 days, scans
  stop and alerts stop with them, silently. I did not touch decision 9. The settings page now
  says so in one line, which is honest but does not solve it. Options for Dustin: exempt
  projects with alerts on from the idle pause, or count an email click as "opened" (it already
  does if they open the report).
- **`APP_NAME` and the deployed subdomain are two values.** Email links use
  `https://<APP_NAME>.app.space` (the `[vars]` entry in `wrangler.toml`); the deploy claims the
  top-level `name`. Both say `bumpcheck` today. If the app is renamed or given a custom
  domain, `APP_NAME` (or `BUMPCHECK_APP_ORIGIN`) has to follow or every email link breaks.
- `SharingSection` on the settings page (ticket 05) had the same "switch stays disabled"
  pattern as the new alert switch; I changed both the same way.
- The live check used to stop if the example repo was already one of Alice's projects. It
  now deletes the project at the end of a run, so a second run has a first scan again.
- **A note for the mutation check:** breaking delete so that it leaves the public report
  (as I did) leaves a real orphaned report in the local record room, and the next gate run
  then failed at ticket 05's `nothing public is left behind`. `test-reset-my-projects` now
  also removes any public report whose project no longer exists, so a later run cleans up
  after such a mutation. The first full gate run for this ticket failed for exactly that
  reason; the output below is the run after it.
- `src/actions/test-reset.ts` has its "Action not found unless..." paragraph twice in the
  header comment (from earlier tickets).

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


 Test Files  33 passed (33)
      Tests  633 passed (633)
   Start at  05:08:35
   Duration  2.77s (transform 3.59s, setup 0ms, import 13.44s, tests 1.63s, environment 7ms)


> bumpcheck@0.0.1 test:smoke
> deepspace test run smoke

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:08:45 AM [generouted] scanned 9 routes in 9 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5128 ms
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

  ✓  1 tests/smoke.spec.ts:21:3 › Smoke tests › static landing loads without JS errors (743ms)
  ✓  2 tests/smoke.spec.ts:29:3 › Smoke tests › landing carries one title, one description, one canonical (397ms)
  ✓  3 tests/smoke.spec.ts:40:3 › Smoke tests › static contract: landing fires no auth request, opens no websocket (1.9s)
  ✓  4 tests/smoke.spec.ts:55:3 › Smoke tests › dynamic app boundary mounts on /home (599ms)
  ✓  5 tests/smoke.spec.ts:60:3 › Smoke tests › sign-in button visible when logged out (497ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  6 tests/smoke.spec.ts:66:3 › Smoke tests › unknown route shows 404 (398ms)

  6 passed (13.6s)

> bumpcheck@0.0.1 test:api
> deepspace test run api

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:09:02 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 4974 ms
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

  ✓  1 tests/api.spec.ts:4:3 › API tests › auth proxy forwards to auth worker (264ms)
  ✓  2 tests/api.spec.ts:9:3 › API tests › WebSocket endpoint exists (871ms)

  2 passed (9.9s)

> bumpcheck@0.0.1 test:signed-in
> deepspace test run tests/projects.spec.ts && deepspace test run tests/project-page.spec.ts && deepspace test run tests/sharing.spec.ts && deepspace test run tests/alerts.spec.ts && deepspace test run tests/scheduling.spec.ts

Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:09:16 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5037 ms
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
  ✓   1 tests/projects.spec.ts:73:1 › the projects list starts empty, a project is added, and its first scan finishes while watching (4.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   2 tests/projects.spec.ts:105:1 › adding the same repo twice is refused with its own message (2.7s)
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
  ✓   3 tests/projects.spec.ts:119:1 › the project limit is reported, and nothing is added past it (2.8s)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
  ✓   4 tests/projects.spec.ts:140:1 › add requests sent at the same moment cannot get past the project limit (4.4s)
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
  ✓   6 tests/projects.spec.ts:178:1 › one user's projects are not in another user's list (3.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   7 tests/projects.spec.ts:193:1 › an action needs a verified sign-in: no token, no project (35ms)
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
  ✓   8 tests/projects.spec.ts:205:3 › the job room is locked down › a member cannot enqueue a job, and cannot read the queue (5.4s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/projects.spec.ts:228:3 › the job room is locked down › a signed-out visitor cannot enqueue a job either (2.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/projects.spec.ts:239:1 › a signed-in member cannot call an owner-billed integration from the browser (542ms)

  10 passed (37.7s)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:09:57 AM [generouted] scanned 9 routes in 11 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5030 ms
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
  ✓   2 tests/project-page.spec.ts:167:1 › a verdict is marked as reviewed, moves to the collapsed section, and undo brings it back (4.3s)
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
  ✓   4 tests/project-page.spec.ts:226:1 › a change made in one tab appears in a second tab (3.6s)
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   6 tests/project-page.spec.ts:277:1 › Bob cannot see Alice's private project by URL, and cannot act on it (8.1s)
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
  ✓   9 tests/project-page.spec.ts:389:1 › a verdict read from a later version is not shown to a project on an older one, until its own check reads the wider range (9.0s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "check-dependency" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  10 tests/project-page.spec.ts:420:1 › a check that cannot finish says so, keeps the report, and can be asked again (8.7s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
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
[WebServer] [alert] not sent: alerts-off
  ✓  12 tests/project-page.spec.ts:484:1 › scan progress is shown live while the first scan runs (6.5s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  13 tests/project-page.spec.ts:505:1 › a project with no dependencies shows an empty state, not an empty page (2.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
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
[WebServer] 5:11:21 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5031 ms
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
  ✓   2 tests/sharing.spec.ts:204:1 › a public report is readable signed-out, offers no actions, and what the reader received names nobody (10.0s)
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
  ✓   3 tests/sharing.spec.ts:298:1 › another signed-in user reads a public report the same way: no actions, no owner (13.3s)
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
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   4 tests/sharing.spec.ts:335:1 › a private project's link shows "not available", signed-out and to Bob, exactly like a link to nothing (16.1s)
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
  ✓   5 tests/sharing.spec.ts:391:1 › switching back to private removes access, even from a page that is already open (13.1s)
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
  ✓   6 tests/sharing.spec.ts:430:1 › only the owner can change who sees a project (16.2s)
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
  ✓   7 tests/sharing.spec.ts:499:1 › a public report follows its project: a check that finishes shows up for the reader (5.6s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "add-project" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-publish-example" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓   8 tests/sharing.spec.ts:518:1 › the landing page says what bumpcheck does, links to the example report, and offers sign-in (3.3s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓   9 tests/sharing.spec.ts:556:1 › the test-only example fixture is not an open door (15ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1005 reason=
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/sharing.spec.ts:561:1 › nothing public is left behind (4.2s)

  10 passed (1.6m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:13:01 AM [generouted] scanned 9 routes in 10 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5212 ms
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
[WebServer] [cron] daily-scans ok 29ms
[WebServer] [alert] sent, 2 verdicts
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "record-opened" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 25ms
[WebServer] [alert] not sent: nothing-new
[WebServer] [action] "test-read-outbox" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
[WebServer] [action] "test-email-allowance" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
  ✓  2 tests/alerts.spec.ts:180:1 › a daily scan sends one alert to the owner, logs it, and does not send it again (10.2s)
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
  ✓  3 tests/alerts.spec.ts:232:1 › a test send appears in the log, and the fourth test send in a day is refused (7.4s)
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
  ✓  4 tests/alerts.spec.ts:288:1 › a test email that cannot be sent is shown as failed, with the reason (3.6s)
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
  ✓  5 tests/alerts.spec.ts:310:1 › the unsubscribe link turns alerts off while signed out: the page asks once, and one click does it (13.3s)
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
  ✓  7 tests/alerts.spec.ts:398:1 › a bad unsubscribe link gets a plain error page (119ms)
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
  ✓  8 tests/alerts.spec.ts:410:1 › only the owner can change alerts, send a test, or delete a project (10.3s)
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

  9 passed (1.4m)
Secrets: prd (1 secret)
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
[WebServer] Using secrets defined in .dev.vars
[WebServer] 5:14:30 AM [generouted] scanned 9 routes in 9 ms
[WebServer] [ESLint] Found 0 error and 0 warning
[WebServer] Using secrets defined in .dev.vars
[WebServer] 
[WebServer]   VITE v8.3.8  ready in 5076 ms
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
[WebServer] [cron] daily-scans ok 7ms
[WebServer] [action] "test-set-project-times" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 1, stalled 0
[WebServer] [cron] daily-scans ok 25ms
[WebServer] [alert] not sent: alerts-off
[WebServer] [action] "test-run-scheduled-task" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [cron] daily-scans: enqueued 0, stalled 0
[WebServer] [cron] daily-scans ok 6ms
  ✓   1 tests/scheduling.spec.ts:132:1 › the scheduled task, triggered directly, re-scans a due project and leaves one that is not due (8.8s)
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
[WebServer] [cron] daily-scans ok 25ms
[WebServer] [alert] not sent: alerts-off
  ✓   2 tests/scheduling.spec.ts:163:1 › an idle project is not scanned until its owner opens it again (6.8s)
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
  ✓   4 tests/scheduling.spec.ts:236:1 › scan now is refused while a scan is running: one scan at a time (6.4s)
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
[WebServer] [cron] daily-scans ok 24ms
[WebServer] [alert] not sent: alerts-off
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
  ✓   7 tests/scheduling.spec.ts:339:1 › a failed scan shows its reason and a retry, and the retry is under the cooldown (14.8s)
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
  ✓   9 tests/scheduling.spec.ts:393:1 › add-project attempts are capped per user per day, and the refusal says when the cap resets (10.8s)
[WebServer] [alert] not sent: alerts-off
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  10 tests/scheduling.spec.ts:426:3 › the cron room is locked down › a member cannot trigger, pause or resume the scheduled task (4.4s)
  ✓  11 tests/scheduling.spec.ts:433:3 › the cron room is locked down › a signed-out visitor cannot either (3.8s)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  12 tests/scheduling.spec.ts:439:3 › the cron room is locked down › the test-only trigger is not an open door: it needs a sign-in (12ms)
[WebServer] [action] "test-reset-my-projects" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-fake-world" caller=UnVsF80K2X8PRW1zGqY4cMxDAuaa7CZB
[WebServer] [action] "test-reset-my-projects" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [action] "test-reset-fake-world" caller=0VFOJ3MLzLnqL1bbkBnw8O9yH2vFUrUE
[WebServer] [RecordRoom] webSocketClose code=1001 reason=
  ✓  13 tests/scheduling.spec.ts:445:1 › nothing is left behind for the next run of the scheduled task (2.7s)

  13 passed (1.4m)
```
