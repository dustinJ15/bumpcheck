# bumpcheck: writeup (draft)

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

The live check (one real scan of the example repo plus one test email) cost 7.9 credits, about
US$0.08: Claude 19 calls for about US$0.043 (about US$0.0022 a call), GitHub 16 calls, email one.
At that rate the daily AI ceiling caps AI spend near US$0.33 a day.
TODO(supervisor): update with the pre-deploy live check, run after the output cap was raised from
1,500 to 3,500 tokens (ticket 06b).

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
(lint, type check, about 650 unit and engine tests, then browser tests against fake services),
read the diff, looked at the screenshots, and ran a mutation check, deliberately breaking rules to
prove a test goes red. From ticket 03 on, work was test-first with a red/green log. Workers ran on
Claude Opus and Claude Fable. Tests never call paid services; the paid live check was run by hand.

## What Dustin decided, verified or changed

TODO(supervisor): fill from the ledger

## Known gaps and unfinished edges

- The impact-analysis stretch (which breaking changes touch your code) is not built.
- The live check's email went to a test account with no inbox, so the email's look in real mail
  clients and the `List-Unsubscribe` header arriving are unverified.
- A GitHub Releases request that GitHub refuses stores nothing and is asked again on every scan,
  each time after one paid GitHub call.
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
