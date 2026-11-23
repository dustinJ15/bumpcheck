# 06 — Email alerts

**Status:** ready-for-agent

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
