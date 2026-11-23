# 03 — Project page with triage

**Status:** ready-for-agent

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
