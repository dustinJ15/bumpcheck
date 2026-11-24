# bumpcheck: writeup

Live: https://bumpcheck.app.space · Example report:
https://bumpcheck.app.space/share/1795533371868_l31797 · Repository:
https://github.com/dustinJ15/bumpcheck

## What it is

bumpcheck tells you which dependency upgrades in a JavaScript project will break. You add a public
GitHub repo; it reads the root `package.json`, sorts every npm dependency by how far behind it is,
and for major upgrades reads the changelog with Claude and gives a verdict (breaking, safe or
unclear) listing each change and what to do about it, with a link to the source it read. Minor and
patch upgrades are shown as "not read" unless you ask for one. Core path: add a repo, the first
scan starts and its progress shows live, verdicts appear, you mark them reviewed (with undo), the
project is re-scanned daily, an opt-in email reports new breaking upgrades (one-click unsubscribe),
and a switch makes a read-only public report you can share by link.

## DeepSpace primitives and integrations used, and why

- **Records with owner-only rules, and server actions for every write.** No client may create,
  update or delete a row; each action checks the verified caller, ownership and limits first.
  Projects are readable by their owner only. Verdicts are a shared, read-only cache. The users
  roster is limited to the user's own row.
- **Job room** for scans: resumable across 15-minute ticks with a checkpoint, and locked so only
  the owner role can enqueue, cancel or read jobs. Actions enqueue on the user's behalf.
- **Cron room**: one hourly task that picks projects due for their daily scan. Locked at its route
  to the owner.
- **Integrations, all billed to the app owner and called only from server code:** GitHub (repo
  metadata and files), Claude through the platform's AI helper (`claude-haiku-5-5`, with explicit
  input and output caps), and email (alerts and test emails, rendered by code, not AI).
- **Secret store** for the key that signs unsubscribe links.

Left out, following the spec's "Out of Scope": AI chat, collaborative editing, presence, messaging,
file storage, the knowledge base and payments. None serves the core path, and each would be more
surface to secure on a $5 budget. User-billed OAuth integrations are left out because bumpcheck
reads public repos only.

## The main tradeoff

The whole app, for every user, runs on one account with US$5 of credits. So AI is spent only
where it pays:

- **A shared verdict cache** keyed by package, current major and target version. A changelog
  verdict is the same for everyone, so the second project with `express` 4 → 5 costs nothing.
- **Semver triage decides where AI goes.** Majors (and `0.x` minors) are read automatically; minor
  and patch upgrades only when the user asks. No changelog means no AI call.
- **Hard limits in one module** (`src/config.ts`): 3 projects per user, 15 new verdicts per scan,
  150 AI calls a day app-wide (the owner is exempt from per-user limits, not from that ceiling),
  a 10-minute "scan now" cooldown, daily scans paused after 7 idle days.

Measured, not estimated: one verdict costs about US$0.0025 (Claude Haiku through the platform).
The first scan of the example repo on the live site made 11 Claude calls for 12 major upgrades
(about US$0.026). At that rate the 150-call daily ceiling caps AI spend near US$0.40 a day. The
whole build, including two paid live checks and the production scan, used 19.3 of the 500
credits (US$0.19).

The first paid live check found a real bug the fakes could not: 7 of 12 verdicts failed because
long changelogs produced answers longer than the 1,500-token output cap. The fix bounds the answer
in the prompt (8 changes at most, short fields, with headroom below what the validator accepts),
raises the cap to 3,500 tokens with the arithmetic in a comment, tells a cut-off answer apart from
bad JSON, and retries a cut-off with a shorter request. The next live check read all 12.

## Platform facts found during the build

- A reader always receives whole rows, owner field included. So a public report is a separate
  `publicReports` row holding only what the public page shows, written by server code.
- The job room counts every resumed tick as an attempt, so "retry a failed scan once" is tracked
  in the job's own checkpoint.
- Every signed-in member can trigger, pause and resume scheduled tasks by default; the app narrows
  this at its own route.
- The scaffold's integration proxy let any signed-in user call owner-billed integrations from the
  browser console. It is closed.
- The users roster by default shows every signed-in member every other user's id and name; the
  app restricts it to the caller's own row.

## What the agent did

A supervising Claude session ran a loop of fresh worker agents, one ticket each, from a spec and an
interview ledger written with Dustin. The supervisor verified every ticket itself: it ran the gate
(lint, type check, about 650 unit and engine tests, then 65 browser tests against fake services),
read the diff, looked at the screenshots, and ran a mutation check, deliberately breaking rules to
prove a test goes red (about 40 by the supervisor, many more by the workers themselves; the gaps
they found were closed with new tests). From
ticket 03 on, work was test-first with a red/green log. Workers ran on Claude Opus and Claude
Fable. Tests never call paid services; the paid live check was run by hand at fixed points. The
supervisor also deployed, ran the production check below and submitted, on Dustin's instruction.
Every ticket, its completion note and evidence are in `specs/bumpcheck/` in the repository.

## What Dustin decided, verified or changed

Dustin chose the idea and the scope, and set the product decisions in a design interview before
any code was written (the ledger in `specs/bumpcheck/interview-ledger.md`, section A): public
repos only; semver triage before AI; one shared verdict cache; changelog sources and "no text, no
AI call"; a structured verdict with no confidence score; the budget limits; private-by-default
public sharing; the daily schedule; and impact analysis as a stretch. He raised email alerts from
"first to cut" to a primary feature, drawing on his own experience with email, and set its polish
bar: never send the same news twice, HTML with a matching plain-text part, one-click unsubscribe
without sign-in plus the `List-Unsubscribe` header, a test-send button and a send log. He
approved the account setup (two test accounts, the example repo, the signing secret).

During the build he changed three things: he approved changing verdict keys for `0.x` versions
after a worker flagged that the decided key would share one verdict across different `0.x`
minors; he required test-first development with proof, which became the red/green log and the
supervisor's mutation check; and he moved the workers between models as allowances ran out.

He did not personally click through the deployed app before submission. That check was done by
the supervising session on his authority, signed in through his own GitHub session on the live
site: the first scan of `dustinJ15/bumpcheck-example` (13 dependencies) read 11 of its 12 major
upgrades, 10 breaking and 1 unclear, the twelfth not read because GitHub refused its release
notes; the public report opened signed out with no actions and no name; a
test email reached his Gmail with `List-Unsubscribe` and `List-Unsubscribe-Post` headers intact
(DKIM and SPF passing); and its unsubscribe link turned alerts off in one click without sign-in.

## Known gaps and unfinished edges

- The impact-analysis stretch (which breaking changes touch your code) is not built.
- The email was checked in Gmail only; other mail clients (Outlook, Apple Mail) were not tried.
- GitHub's unauthenticated Releases API does refuse requests from the platform's network: on the
  live site it refused once (typescript), which the page shows as "not read this time". A refused
  request stores nothing and is asked again on every scan, each time after one paid GitHub call.
  A token in the secret store would fix it; that was left as Dustin's decision.
- A scan waiting in the job queue for over 30 minutes is treated as stalled; a full scan corrects
  itself when it runs, but a waiting "check this one" request is lost.
- Two requests at the same instant can both pass a check (two "scan now" calls both enqueue);
  two add requests at the project limit are both refused.
- The "repo not found" check matches any error text containing "not found" or "404", which is
  looser than it should be.
- Daily scans pause after 7 days without opening the project, and alerts pause with them, so a
  user who relies only on email stops hearing. The settings page says so.
- The public report is a copy written when a scan ends, so it shows no live progress.
- Loading and error states for a failing record room are written but not driven by tests.
- The scaffold's collaboration rooms (Yjs, canvas, presence) are still declared in `worker.ts`,
  unused.
