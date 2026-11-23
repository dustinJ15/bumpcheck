# 02 — Add-project flow

**Status:** ready-for-agent

**Who:** worker · **Changes a page:** yes · **Blocked by:** 01
**Stories:** 3, 5–10, 23, 58 · **Decisions:** 1, 4, 7, 14, 15, 17

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

## Goal

A signed-in user enters a repo, the project appears, and its first scan runs to completion as
a background job. In tests, all of it runs against the fakes.

## Build

**Real implementations** behind ticket 01's interfaces. Write and type-check them; do not call
them.

- Package registry: the npm registry over plain `fetch` (latest version, published versions,
  source repo location including a monorepo subfolder).
- Source host: the GitHub integration for repo metadata, tree and single files; plain `fetch`
  to GitHub's public Releases API as the best-effort fallback. A refused fallback degrades to
  "no changelog found".
- Judge: Claude through the platform's AI helper for jobs, model and caps from the config
  module (`claude-haiku-5-5`, output cap, input cap). Two attempts, then a typed failure.
- Record store and clock for the worker.

Where the docs and the installed `deepspace` types disagree, the installed types and the CLI
catalog win.

**Job handler** (`src/jobs.ts`): a `scan` job carrying only a project id and whether it is
on-demand. It runs engine steps until the tick's outbound-call budget is used, then continues
on the next tick with saved state. It wires real or fake implementations through ticket 01's
setting.

**Job room locked down** (`worker.ts`): enqueue, cancel and retry from the owner role only.
Members cannot enqueue or read jobs.

**Integration billing** (`src/integrations.ts`): GitHub owner-billed; nothing callable by
signed-out visitors.

**Add-project action** (`src/actions/`): verifies the caller from the platform's verified
identity; accepts `owner/repo` or a GitHub URL; refuses with a specific message for each of:
repo not found or private; no root `package.json`; invalid JSON; more than 150 dependencies;
project limit reached; same repo already added by this user. On success creates the project
and enqueues its first scan.

**Projects list page** (protected): the user's projects with scan status, the add form with
its inline error messages, and an empty state. Replace the scaffold's `/home` nav entry.

**Live-check command:** add `npm run live-check`. It runs one real scan of
`dustinJ15/bumpcheck-example` and prints what it spent. Leave a clearly marked place for
ticket 06 to add the test email. **Write it; do not run it.** It is not part of the gate.

## Tests required

- Unit: repo input parsing (`owner/repo`, URL forms, junk); each refusal message.
- Browser, using the SDK testing fixture and the existing test accounts (Alice and Bob; do not
  create accounts): add a project and watch its scan finish; adding the same repo twice is
  refused; the project limit is reported.
- A test that a member-role client cannot enqueue a job.

## Supervisor step after this ticket (not worker work)

The supervisor or Dustin runs `npm run live-check` once and records the spend.

## Done means

Acceptance: the flows above work against the fakes; the gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and a
screenshot from `npx deepspace test screenshot` of the projects list (empty and with a
project), saved under `specs/bumpcheck/evidence/02/`.
