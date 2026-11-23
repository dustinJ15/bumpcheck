# bumpcheck — supervisor handoff

*For: the supervising agent session that runs the build loop. You start with no memory of the
planning sessions; everything you need is in this folder.*

## Your job

Get tickets 01 to 07 built, verified and committed, one at a time, by fresh worker agents. Then
stop at ticket 08 and hand to Dustin for the deploy. Tickets 09 and 10 run only if Dustin says
go in ticket 08's completion note.

You do not write feature code yourself. You brief workers, talk with them while they work,
check their evidence, and decide whether a ticket is done.

This handoff is the project-specific layer on top of the `/supervise-ralph-loop` skill
(`~/.claude/skills/supervise-ralph-loop/SKILL.md`). Read that skill too; where the two differ,
this file wins.

## Open communication with workers

This is the most important working rule. Workers are agents you spawn from your own session,
not blind script runs, so you can talk to each other. A worker you spawned keeps its context
when you message it again.

- **Invite questions in every brief.** Tell the worker that asking you is expected whenever
  the ticket is ambiguous, contradicts the spec or ledger, or would need a rule broken, and
  that guessing or working around a problem is the wrong move.
- **Answer from the spec and ledger, citing the section.** If the answer is not there and the
  decision is Dustin's, ask Dustin and relay his answer. Do not invent intent.
- **Continue the same worker** for follow-ups and review findings instead of starting a new
  one. Start fresh only when its context is exhausted or it is stuck on a wrong path.
- **Send findings as specifics:** the criterion, the file and line, what you saw, what done
  looks like.
- **Ask before rejecting a surprising diff.** The worker may have found a real problem with
  the ticket or a platform fact. If so, fix the ticket text and tell Dustin.
- **Ask for honest reports.** Tell workers that "skipped", "could not verify" and "unsure" are
  welcome and that a green-looking report hiding a gap is the worst outcome.
- **Carry knowledge forward.** What one worker learns (the fake-services setting's name, an
  SDK quirk) goes into its ticket's completion note and into the next worker's brief.
- **Keep Dustin posted** with short status, and pass on worker questions that are his.

Talking does not replace checking: a worker's report is a claim until you have verified it.

**Deadline:** Wednesday 2026-11-25, 11:59 PM Eastern. The core (01 to 08) matters more than
the stretch (09 and 10).

## Read first, in this order

1. `specs/bumpcheck/interview-ledger.md` — the authority on intent.
2. `specs/bumpcheck/spec.md` — where it disagrees with the ledger, the ledger wins.
3. `specs/bumpcheck/tickets/README.md` — ticket index, worker rules, and "Done means".
4. `AGENTS.md` — but note the override below.

## Hard rules

- **Node 24 for every command:** `nvm use` in each new shell.
- **Never deploy.** Dustin deploys by hand. This applies to you as well as to workers.
- **Never run `npx deepspace push`.** GitHub is the source authority. `AGENTS.md` describes
  the DeepSpace cloud repo as the default; this project overrides that.
- **Never touch secrets:** the app's secret store, `.dev.vars`, `.deepspace/`.
- **The budget is 500 credits (US$5) for the whole app.** The only paid thing you may run is
  the live check, at the points listed below, once each.
- **Do not re-open** the spec's "Decisions taken" table. If a ticket cannot be done without
  changing one, stop and ask Dustin.
- **Do not `git push`** unless Dustin has told you to in this session.

## The loop

Work tickets strictly in number order. Each depends on the one before, so run **one worker at
a time**.

For each ticket:

1. **Start a fresh worker** on `claude-fable-5-2` at medium effort with this prompt, filling in
   the ticket file (changed by Dustin on 2026-11-23 from `claude-opus-5-5` at high effort;
   ticket 01's worker had already started on Opus and was left running):

   > Implement `specs/bumpcheck/tickets/<file>.md` using the `implement` skill. Read
   > `specs/bumpcheck/tickets/README.md` first; its rules and "Done means" are binding. Read
   > the completion notes of earlier tickets for anything they recorded (for example the name
   > of the fake-services setting). Use Node 24 (`nvm use`) for every command. Never deploy,
   > never run `deepspace push`, never touch secrets, never call a paid service, never run
   > `npm run live-check`. When the gate is green, fill in the ticket's `## Completion`
   > section, set its Status to `done`, and commit on the work branch. Do not push.
   >
   > I am your supervisor and I am available the whole time. Asking me is expected: if the
   > ticket is ambiguous, contradicts the spec or ledger, or would need a rule broken, stop
   > and ask instead of guessing or working around it. If you are stuck on the same problem
   > after a couple of attempts, tell me what you tried. If you notice a problem outside your
   > ticket, tell me. In your report, say plainly what you skipped, could not verify, or are
   > unsure of.

   Add to the brief anything earlier workers learned that this ticket needs.

2. **Verify, yourself, before accepting.** Do not take the worker's report on trust.
   - Run `npm run gate` on the worker's commit. It must be green, and the output pasted in the
     ticket must match what you see.
   - Read the diff. Check: no test was weakened or deleted to pass; no limit is hard-coded
     outside the config module; the engine and pure modules import nothing from `deepspace`;
     nothing reads secrets or local settings files; no test or script can reach a paid service.
   - Check each acceptance criterion and each required test in the ticket actually exists.
   - **Mutation check** (added by Dustin, 2026-11-23): pick at least three rules the ticket
     introduces, break each one in the code in turn (flip a comparison, remove an ownership
     check, change a limit), and run the relevant tests. Each break must turn a test red.
     Restore the code after each. A rule that can be broken with the tests still green sends
     the ticket back with that rule named. Also check the completion note's Red/green log
     (tickets README, rule 12) is present and plausible.
   - For a page ticket, open every screenshot under `specs/bumpcheck/evidence/<n>/` and look
     at it. A broken, blank or scaffold-styled page fails the ticket.
3. **If it fails,** message the same worker with the specific failures. Start a fresh one,
   with the ticket plus your findings, only if the first cannot continue. After two failed
   rounds on one ticket, stop and ask Dustin.
4. **If it passes,** make sure it is committed and the ticket's Status is `done`, then move on.

**Branch:** work on a branch named `ralph/bumpcheck`, created from `main` before ticket 01.
Workers commit there, never to `main`. Merging to `main` before the deploy is Dustin's step.

## Batch boundaries

Batches are three tickets: 01 to 03, 04 to 06, then 07. At each boundary, stop and:

- Ask Dustin for his usage meter reading and wait for the answer before continuing.
- Give him a short status: tickets done, anything left unverified, time left to the deadline.

## Live checks (paid; the only paid thing you run)

`npm run live-check` exists from ticket 02 on. It runs one real scan of
`dustinJ15/bumpcheck-example` and, from ticket 06 on, sends one real test email.

- **After ticket 02 is accepted:** run it once. Record the printed spend in ticket 02's
  completion note.
- **After ticket 06 is accepted:** run it once. Record the spend, and ask Dustin to read the
  email and confirm the `List-Unsubscribe` header arrived.
- **Inside ticket 08:** as its steps say.

If a live check fails, do not rerun it in a loop. Read the error, record what was spent, and
either have a worker fix the real implementation against the fakes or ask Dustin. Never run
it at any other time.

## Ticket 08: stop here

Ticket 08 has no worker. Do its step 1 (gate on a clean tree at the commit to be deployed, paste the output) and step 2
(live check), then hand to Dustin for the cost reading, the two unverified items, the deploy
and the live-site check. Wait for his go or no-go on the stretch.

## Tickets 09 and 10 (only on Dustin's go)

Same loop. After ticket 10 is accepted, tell Dustin; the redeploy is his, and only if the gate
is green with time to spare. If the stretch will not land cleanly, say so early: the deployed
core stands and the writeup records that the stretch was not shipped.

## When to stop and ask Dustin

- A rule above would have to be broken.
- A platform fact in the spec turns out to be wrong against the installed `deepspace` types.
- Ticket 05's check finds that a public page exposes the owner's identity and the platform
  cannot hide it.
- Two failed rounds on one ticket.
- A live check spends noticeably more than a few cents.
- Every batch boundary.

## Already set up — do not recreate

The app is registered with DeepSpace. Two test accounts (Alice and Bob, label `bumpcheck`)
exist on this machine. The secret `UNSUBSCRIBE_SIGNING_KEY` is in the app's secret store. The
example repo `dustinJ15/bumpcheck-example` exists.

## State at handoff (2026-11-23)

No ticket has been started. The scaffold is untouched. `npm run gate` does not exist yet;
ticket 01 creates it.
