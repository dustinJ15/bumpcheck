# bumpcheck — tickets

Ten tickets, worked in order. Each one is a file in this folder.

| # | Ticket | Changes a page | Who |
| --- | --- | --- | --- |
| 01 | [Scan engine, data model, and the gate](./01-scan-engine.md) | no | worker |
| 02 | [Add-project flow](./02-add-project.md) | yes | worker |
| 03 | [Project page with triage](./03-project-page.md) | yes | worker |
| 04 | [Scheduling and limits](./04-scheduling-and-limits.md) | yes | worker |
| 05 | [Public sharing and landing](./05-sharing-and-landing.md) | yes | worker |
| 06 | [Email alerts](./06-email-alerts.md) | yes | worker |
| 07 | [Polish and design](./07-polish-and-design.md) | yes | worker |
| 08 | [Deploy checkpoint](./08-deploy-checkpoint.md) | no | **supervisor / Dustin only** |
| 09 | [Impact analysis: engine](./09-impact-engine.md) | no | worker |
| 10 | [Impact analysis: job and page](./10-impact-page.md) | yes | worker; redeploy is a human step |

Supervisor live checks happen after ticket 02, after ticket 06, and inside ticket 08. Workers
never run the live check.

## Rules for every worker

These apply to every ticket and are not repeated in full in each file.

1. **Read first:** `specs/bumpcheck/spec.md` and `specs/bumpcheck/interview-ledger.md`. Where
   they disagree, the ledger wins. Then `AGENTS.md`.
2. **Node 24 for every command.** Run `nvm use` in each new shell before anything else.
3. **Never deploy.** Do not run `npx deepspace deploy`, `npm run deploy`, or `undeploy`.
4. **Never run `npx deepspace push`.** `AGENTS.md` describes the DeepSpace cloud repo as the
   default; this project overrides that. GitHub is the source authority (spec, "Further Notes").
5. **Never touch secrets.** Do not read, print, create, change or delete anything in the app's
   secret store, `.dev.vars`, or `.deepspace/`. Code reads `UNSUBSCRIBE_SIGNING_KEY` through the
   worker's env binding only; tests use a throwaway key defined in the test.
6. **Never call a paid service.** No real GitHub integration call, no Claude call, no email
   send, from tests, scripts or by hand. Real implementations are written and type-checked but
   are exercised only by the supervisor's live check.
7. **Never run the live check** (`npm run live-check`, added in ticket 02).
8. **Do not re-open** anything in the spec's "Decisions taken" table. If a ticket seems to
   need it, stop and report.
9. **Keep the scaffold's layout and conventions.** Extend, do not rearrange. Clarity beats
   cleverness: Dustin must explain and modify this code live.
10. **Commit only when the gate is green,** on the work branch `ralph/bumpcheck`, never on
    `main`. Do not push unless the supervisor says so. Set the ticket's Status to `done` in
    the same commit.
11. **Talk to the supervisor.** It is available the whole time and asking is expected. If the
    ticket is ambiguous, contradicts the spec or ledger, or would need a rule broken, stop and
    ask; do not guess or work around it. If you are stuck on one problem after a couple of
    attempts, say what you tried. If you find a problem outside your ticket, report it.

## Done means (every ticket)

A ticket is done when its acceptance criteria hold **and** its completion note is filled in:

- Append a `## Completion` section to the ticket file.
- Paste the **full output of `npm run gate`** from the final commit, all green. A summary or
  "gate passes" is not evidence.
- For a ticket marked "changes a page": save a screenshot of each changed page, taken with
  `npx deepspace test screenshot <url> <output>`, into `specs/bumpcheck/evidence/<ticket
  number>/`, and list the paths in the completion note. Use the local server started with the
  fake-services setting from ticket 01. If a signed-in page cannot be reached by that command,
  say so in the note and attach the browser test's own capture of that page instead; do not
  skip the screenshot.
- List anything left undone or found unverified. Do not report a step as done if it was skipped.
