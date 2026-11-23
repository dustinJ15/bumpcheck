# 04 — Scheduling and limits

**Status:** ready-for-agent

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

## Tests required

- Unit: due, idle and cooldown at their boundaries (extend ticket 01's tests if gaps remain);
  the selection function picks due, non-idle, non-scanning projects and respects the bound.
- Engine: a failed scan retries once, then is marked failed with old verdicts intact; the
  owner passes the project limit but is stopped by the daily ceiling.
- Browser: trigger the scheduled task directly (do not wait for the schedule) and see a due
  project re-scan; scan now inside the cooldown shows the notice.

## Done means

Acceptance: the behaviours above hold against the fakes; the gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and
screenshots from `npx deepspace test screenshot` of the project page showing each of the four
notices, saved under `specs/bumpcheck/evidence/04/`.
