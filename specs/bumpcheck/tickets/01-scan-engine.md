# 01 — Scan engine, data model, and the gate

**Status:** ready-for-agent

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
