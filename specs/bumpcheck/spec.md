# bumpcheck — spec

*For: the agents that implement the tickets, and Dustin. This is the destination document.
`interview-ledger.md` beside it is the authority on intent; where they disagree, the ledger wins
and this file gets fixed.*

bumpcheck is a submission for DeepSpace's application build exercise. It is graded on sensible
scope, a working core path, proper use of DeepSpace's platform primitives, protected secrets,
understandable code, and an honest writeup. It is explicitly **not** graded on size. A live
coding session follows, in which Dustin must explain and modify this code, so clarity beats
cleverness everywhere.

**Hard constraints that shape every decision:**

- The whole app runs on one DeepSpace account holding **500 credits (US$5)**. Every paid call,
  by any user, bills that account.
- Deadline: Wednesday 2026-11-25, 11:59 PM Eastern.
- Toolchain: Node 24 (pinned), DeepSpace SDK 0.44.x. The scaffold's layout and conventions are
  kept; extend it, do not rearrange it.

## Problem Statement

When I maintain a JavaScript project, I know some of my dependencies are behind, but I can't
tell which upgrades are free and which will cost me a day. Version numbers hint at it; the real
answer is buried in changelogs I don't have time to read for thirty packages. Tools that open
upgrade pull requests tell me a new version exists, not what it will break. So I put upgrades
off, they pile up, and the eventual jump is worse.

## Solution

I point bumpcheck at a public GitHub repo. It reads the repo's dependency list, works out how
far behind each dependency is, and for the upgrades that are likely to hurt (major versions) it
reads the changelog and gives me a verdict: breaking, safe, or unclear, with a list of what
changed and what to do about each change. It keeps watching daily and can email me when a new
breaking upgrade appears. I can mark verdicts as reviewed so the page shows only what's new,
and I can share a project's report publicly with a link.

As a stretch, bumpcheck also looks at my repo's source and tells me which breaking changes
touch APIs my code actually uses, with file and line links.

## User Stories

**Visiting and signing in**

1. As a visitor, I want a landing page that says what bumpcheck does in a sentence, so that I
   can decide whether to try it.
2. As a visitor, I want to open a live example project without signing in, so that I can see
   real output before giving the app access to my identity.
3. As a visitor, I want to sign in with GitHub or Google, so that I don't create another
   password.
4. As a signed-out visitor on a private project's link, I want a clear "not available" page, so
   that I'm not shown a blank screen.

**Adding a project**

5. As a user, I want to add a project by entering `owner/repo` or pasting a GitHub URL, so that
   I don't have to copy files around.
6. As a user, I want a specific message when the repo doesn't exist or is private, so that I
   know bumpcheck only reads public repos.
7. As a user, I want a specific message when the repo has no root `package.json` or it isn't
   valid JSON, so that I know why nothing was scanned.
8. As a user, I want to be told when I've reached my project limit, so that I can delete one
   rather than wonder why the button fails.
9. As a user, I want to be stopped from adding the same repo twice, so that I don't waste a
   project slot.
10. As a user, I want the first scan to start as soon as I add a project, so that I see results
    without another click.

**Reading the report**

11. As a user, I want every dependency sorted into breaking, unclear, safe major, minor or patch
    (not read), up to date, and not checked, so that I can see the shape of my upgrade debt at
    a glance.
12. As a user, I want runtime dependencies and dev dependencies shown as separate groups, so
    that I can prioritise what ships to production.
13. As a user, I want each outdated dependency to show the version I'm on and the version
    available, so that I know the size of the jump.
14. As a user, I want a breaking verdict to list each breaking change with what changed and
    what to do, so that I can estimate the work.
15. As a user, I want each verdict to link to the changelog it was read from, so that I can
    check the source myself.
16. As a user, I want minor and patch upgrades labelled "not read" rather than "safe", so that
    I'm not given assurance nobody checked.
17. As a user, I want to ask for a verdict on any minor or patch upgrade, so that I can check
    one I don't trust.
18. As a user, I want an "unclear" verdict when the changelog is vague, so that the app doesn't
    guess.
19. As a user, I want to see "no changelog found" with a link to the package's releases page,
    so that I can look myself.
20. As a user, I want dependencies that can't be checked (git URLs, local paths, workspace
    links, private packages) listed as "not checked", so that nothing silently disappears.
21. As a user, I want to see when the changelog was too long and got cut off, so that I know
    the verdict may be incomplete.
22. As a user, I want a failed verdict to show a retry button, so that a one-off error isn't
    permanent.

**Scanning**

23. As a user, I want to watch a scan's progress live, so that I know it's working.
24. As a user, I want a "scan now" button, so that I can refresh after changing my
    dependencies.
25. As a user, I want to be told when "scan now" is cooling down and when it will be available,
    so that I'm not left pressing a dead button.
26. As a user, I want my projects re-scanned daily without my doing anything, so that new
    releases show up on their own.
27. As a user, I want a failed scan to show its reason and a retry, and to keep the verdicts I
    already had, so that one failure doesn't wipe the page.
28. As a user, I want to be told when a scan stopped at its limit and the rest will be read by
    later scans, so that I understand why some majors have no verdict yet.
29. As a user, I want to be told when the app's daily AI limit has been reached, so that I know
    it's a limit and not a fault.
30. As a returning user, I want daily scans to resume when I open a project that had gone
    idle, so that I don't have to re-enable anything.

**Triage**

31. As a user, I want to mark a verdict as reviewed, so that it moves out of my way.
32. As a user, I want reviewed verdicts kept in a collapsed section, so that I can find them
    again.
33. As a user, I want to undo "reviewed", so that a misclick isn't permanent.
34. As a user, I want a newer verdict for the same package to appear as new, so that I don't
    miss a further release.
35. As a user, I want my projects list to show how many unreviewed breaking upgrades each
    project has, so that I know where to look first.
36. As a user with two tabs open, I want a change in one to appear in the other, so that the
    state is never stale.

**Email alerts**

37. As a user, I want to turn on email alerts per project, so that I hear about new breaking
    upgrades without opening the app.
38. As a user, I want alerts off by default, so that I never get mail I didn't ask for.
39. As a user, I want one email per project per day at most, and none when nothing is new, so
    that the alerts stay worth reading.
40. As a user, I want never to be alerted twice about the same verdict, so that I can trust
    each email is news.
41. As a user, I want the email's subject to name the repo and the count, so that I can triage
    from my inbox.
42. As a user, I want the email to list each package, the version jump, the summary and the
    first "what to do" note, so that it's useful without clicking.
43. As a user, I want to unsubscribe with one click, without signing in, so that leaving is
    easy.
44. As a user, I want to send myself a test email, so that I can see what alerts look like.
45. As a user, I want a log of sent and failed alerts on the project's settings, so that I can
    tell whether an alert went out.
46. As a user reading in a plain-text mail client, I want the same content as the HTML version,
    so that nothing is lost.

**Sharing**

47. As a user, I want to make a project's report public with a switch, so that I can share it
    with my team.
48. As a user, I want projects private by default, so that nothing is shared by accident.
49. As a visitor on a public report, I want to read everything and change nothing, so that the
    link is safe to pass around.
50. As a user, I want a public report not to show my name or email, so that sharing a repo's
    report doesn't share my identity.

**Managing**

51. As a user, I want to delete a project and its alert log, so that I can free a slot.

**Impact analysis (stretch)**

52. As a user, I want each breaking change to say whether my code likely uses the affected
    APIs, so that I can ignore changes that don't touch me.
53. As a user, I want the files and line numbers where the affected names appear, linked to
    GitHub, so that I can go straight to the code.
54. As a user, I want "no usage found" shown distinctly from "can't tell", so that I know
    whether the app looked.
55. As a user with a large repo, I want to be told when only part of it was analysed, so that
    I don't over-trust the result.

**Owner**

56. As the app owner, I want every limit in one configuration module, so that I can tune and
    explain the budget.
57. As the app owner, I want to be exempt from per-user limits but not the daily ceiling, so
    that I can test freely without being able to drain the account.
58. As the app owner, I want only server code to be able to start paid work, so that no signed-in
    user can spend credits from their browser console.

## Implementation Decisions

### Decisions taken — do not re-open without Dustin

| # | Decision | Reasoning |
|---|---|---|
| 1 | Input is a public GitHub repo only: root `package.json`, default branch, no monorepos | One creation flow; the stretch reads the same repo |
| 2 | Semver triage decides AI spend: majors (and `0.x` minors) are read automatically; minor and patch only on demand | AI goes where breakage is expected; triage is free and testable |
| 3 | Verdicts are a shared cache keyed by package, current major, and target major.minor. For a `0.x` current version the "current" part is `0.<minor>`, because each `0.x` minor is treated as a major (amended by Dustin, 2026-11-23) | A changelog verdict is the same for everyone; this is the main cost control. Without the `0.x` rule, a project on 0.1 would be shown a verdict judged from 0.4 |
| 4 | Changelog text comes from `CHANGELOG.md` via the GitHub integration, then GitHub's public Releases API as a best-effort, unauthenticated fallback | Free coverage for releases-only packages; refusal degrades to "no changelog found" |
| 5 | No changelog text means no AI call | Never guess, never pay for nothing |
| 6 | Verdicts are structured and validated; no confidence score | API names feed impact analysis; a self-reported score is false precision |
| 7 | Model is `claude-haiku-5-5`, with explicit output and input caps | The platform default is Opus with a 64,000-token output reservation |
| 8 | Limits: 3 projects per user, 15 new AI verdicts per scan, 150 AI calls per day app-wide | Protects the $5; the daily ceiling turns "broken" into "rate-limited, and says so" |
| 9 | Daily scans via an hourly tick that picks due projects; paused after 7 idle days | Matches how often dependencies change; abandoned projects stop costing |
| 10 | Email alerts are a primary feature, opt-in per project, sent to the sign-in address | Dustin's call; closes the loop on scheduled scanning |
| 11 | Emails are rendered by code from stored verdicts, never by AI | An alert costs one email and nothing else |
| 12 | Impact analysis is code-only matching and is the stretch, built last | Free, reproducible, explainable line by line |
| 13 | Light triage: one "mark as reviewed" action | Makes the page finishable without building a task manager |
| 14 | All record writes go through server actions; clients cannot create or edit rows | One place checks ownership and limits |
| 15 | Only the owner role can enqueue jobs; server actions enqueue on a user's behalf | By default any member can enqueue from the browser, bypassing every limit |
| 16 | Deploys are done by Dustin by hand, never by a loop worker | Deploy registers identity and locks the source authority |
| 17 | Tests never call paid services | Tests in this SDK hit real integrations and spend credits unless we prevent it |

### Platform facts to build on (verified against SDK 0.44.2 docs, types and live catalog)

- Jobs and scheduled tasks run as the app owner and always bill the owner. There is no way to
  bill an end user from a job.
- A job gets 15 minutes of wall time per tick and resumes by handing state to its next tick.
  Jobs in a room run one at a time.
- The job context offers progress, continue and an abort signal only. Records and owner-billed
  integration calls inside a job come from the same owner context that scheduled tasks use.
- Records written by a job are created as the owner. For a user to read "their" rows, the row
  carries the user's id in a column named as the schema's owner field.
- A schema's visibility field plus the "published" read rule lets signed-out visitors read rows
  marked public, enforced by the server. Signed-out visitors connect in the viewer role.
- New signed-in users get the member role. The owner is admin.
- By default, the job room lets members enqueue and lets anyone who can enqueue also read every
  job and its payload.
- Sign-in is GitHub or Google. Public email sign-up is closed; email and password works only
  for test accounts.
- Worker code may `fetch` arbitrary hosts. No subrequest ceiling is documented, so batch
  outbound calls conservatively and spread large batches across job ticks.
- Scheduled task intervals are whole minutes from 1 upward. The schedule arms on the app's
  first request. A task can be triggered directly, which tests should use.
- GitHub integration: reading a repo's file tree, a file's contents, and repo metadata works on
  public repos under owner billing with no user OAuth. There is no releases endpoint.
- Email integration: always sends from DeepSpace's shared address and ignores any sender given;
  a reply-to and custom headers are accepted inputs. Required inputs are recipient and subject.
- Prices: GitHub calls $0.0013 to $0.0039 each; email $0.013 each; Claude at provider cost plus
  an undisclosed markup. 100 credits = US$1.
- The room identifier for jobs, schedules and records uses the app's immutable id, not its name.
- Found during the build (SDK 0.44.2): a reader always receives whole rows, including the
  owner field and `createdBy`; no column can be hidden. So public sharing does not use the
  "published" rule on projects. Projects are owner-only, and a public project has a second
  row in a `publicReports` collection holding only what the public page shows, written and
  removed by server code as the app owner (ticket 05).
- Found during the build (SDK 0.44.2): the job room counts every handler run, including each
  resume, as an attempt, so "retry once" is tracked in the job's own checkpoint. The scheduled
  task room gives every signed-in member trigger, pause and resume, with no option to restrict
  it, so the app restricts it at its own route to the owner's role.

Where the docs and the installed types disagree, the installed types and the live CLI catalog
win.

### Modules

Deep modules with small interfaces. The first group is pure and has no I/O.

- **Dependency triage.** Given a `package.json` and the latest published version of each
  dependency, classifies each as up to date, patch, minor, major, or not checked. The current
  version is the lowest version the declared range allows; the lockfile is not read. The target
  is the registry's `latest` tag; prereleases are ignored. A `0.x` minor bump counts as major.
  Git URLs, local paths, workspace links and unpublished packages are "not checked". Covers
  `dependencies` and `devDependencies`; ignores peer and optional dependencies.
- **Changelog slicer.** Given a changelog's text and a version range, returns only the sections
  for versions inside the range, tolerating the common heading styles. Cuts the result at the
  input cap and reports that it did. For release-list input, selects and concatenates the
  releases in range.
- **Verdict contract.** The schema for a verdict, the prompt that asks for it, and the
  validator that accepts or rejects a model response.
- **Limits.** Pure decisions over counts and timestamps: may this user add a project, may this
  scan read another verdict, is the daily ceiling reached, is "scan now" cooling down, is a
  project due, is a project idle.
- **Alert composer.** Given a project and its not-yet-alerted breaking verdicts, produces the
  subject, HTML body, text body and headers, or nothing when there is nothing to send.
- **Unsubscribe tokens.** Signs and verifies a token naming one project, using a key from the
  app's secret store.
- **Import scanner (stretch).** Given a source file's text, returns the packages it imports,
  covering static imports, `require`, dynamic imports and subpath imports.
- **Usage matcher (stretch).** Given a file's text and a list of API names, returns the lines
  where they appear as whole identifiers.

The second group defines the outside world as interfaces. Each has one real implementation and
one fake.

- **Package registry.** Latest version, published versions and source repository location
  (including a monorepo subfolder) for a package. Real: the npm registry over plain `fetch`.
- **Source host.** Repo metadata and default branch; a file's contents; the file tree; a
  package's changelog file; a package's release notes; raw file contents for analysis. Real:
  the GitHub integration for metadata, tree and single files; plain `fetch` to GitHub's public
  Releases API and raw file host for the rest.
- **Judge.** Changelog text in, validated verdict or a typed failure out. Real: Claude through
  the platform's AI helper for jobs.
- **Mailer.** Sends one composed message, reports success or failure. Real: the email
  integration.
- **Record store** and **clock.**

The third group orchestrates.

- **Scan engine.** Receives the interfaces above and a project id; runs one scan step at a
  time so a job can checkpoint between steps. Steps: read the repo's `package.json`; triage;
  attach cached verdicts; for majors without one, fetch and slice the changelog and ask the
  judge, within the per-scan and daily limits; write results and progress to the project; then
  hand off to alerting. Contains no platform imports, so it runs unchanged in tests.
- **Alert step.** After a daily scan, for a project with alerts on: collect breaking verdicts
  that are neither reviewed nor already alerted for this project; if any, compose, send, log
  the outcome, and record which verdicts were alerted. A failed send is retried once on the
  next scan, then left as failed. Never runs for an on-demand scan started by "check this one".
- **Impact engine (stretch).** For a project with breaking verdicts: read the file tree once;
  build and store the map of which files import which package, keyed by commit; for each
  breaking change, search the importing files for its API names; store the result on the
  project.

The thin platform layer wires these in: schemas, server actions, the job handler, the
scheduled task, and pages.

### Data

- **Projects.** Owned by a user, with a visibility field: private (default) or public. Holds
  the repo identity, the dependency list with each entry's triage result and a pointer to its
  verdict, scan status and progress, last scan time and next due time, last opened time, the
  reviewed verdict keys, the alert setting, the verdict keys already alerted, and (stretch) the
  impact results and import map. Members read their own; signed-out visitors and other members
  read public ones. Clients cannot create, update or delete.
- **Verdicts.** Shared. Keyed by package, current major (`0.<minor>` for a `0.x` current
  version) and target major.minor. Holds the
  status (ready, no changelog, failed), the label (breaking, safe, unclear), summary, the list
  of changes (title, what changed, API names, what to do), the source link, whether the input
  was cut, and the exact versions judged. A verdict for a same-major (minor or patch) upgrade
  applies to a dependency only when the versions it judged start at or below the dependency's
  current version; otherwise the dependency stays "not read" and its own check reads the
  wider range and replaces the stored verdict (added 2026-11-23, ticket 03). Readable by every role including signed-out visitors,
  since the content is public package information. Written only by server code.
- **Alerts.** The send log: project, time, verdict keys included, kind (alert or test), outcome
  and failure reason. Owner-scoped by the user's id. Written only by server code.
- **Usage.** One row per day counting AI calls app-wide. Server-only.

A public project page must not expose its owner's id, name or email.

### Server actions

Every action verifies the caller from the platform's verified identity, checks ownership, and
applies limits before doing anything paid.

- Add a project (validates the repo, enforces the project limit and the duplicate rule, creates
  the project, enqueues its first scan).
- Scan now (enforces the cooldown and the one-scan-at-a-time rule, enqueues).
- Check one dependency (enqueues an on-demand read for a minor or patch upgrade, within
  limits).
- Retry a failed verdict.
- Mark a verdict reviewed, and undo it.
- Set a project's visibility.
- Set a project's alert setting.
- Send a test email (3 per user per day).
- Delete a project (removes it and its alert log; shared verdicts stay).
- Record that a project was opened (resets the idle timer).

One public HTTP route outside the action layer: unsubscribe, which verifies the signed token,
turns alerts off for that project, and shows a confirmation page. It requires no sign-in and
can do nothing else.

### Jobs and schedule

- Job types: scan (carrying only a project id and whether it is on-demand) and, for the
  stretch, impact (carrying only a project id).
- The job room accepts enqueue, cancel and retry from the owner role only.
- A scan job runs engine steps until the tick's budget of outbound calls is used, then
  continues on the next tick with its saved state. A scan is retried once on failure.
- One scheduled task runs hourly. It selects projects that are due (last scan over 24 hours
  ago), not idle (opened within 7 days), and not already scanning, and enqueues a bounded
  number per tick.

### Limits and caps (all in one configuration module)

| Setting | Value |
|---|---|
| Projects per user | 3 |
| Dependencies per project | 150 |
| New AI verdicts per scan | 15, runtime dependencies first |
| AI calls per day, app-wide | 150 |
| "Scan now" cooldown | 10 minutes |
| Re-scan interval | 24 hours |
| Idle pause | 7 days without the owner opening the project |
| Model | `claude-haiku-5-5` |
| Output cap per verdict | 3,500 tokens, sized to the biggest answer the bounds below allow (ticket 06b) |
| Verdict size | at most 8 changes (3 in the retry after a cut-off answer); short fields, limits in `src/config.ts` |
| Changelog input cap | about 30,000 characters |
| Judge attempts per verdict | 2, then "failed" |
| Test emails | 3 per user per day |
| Alert emails | 1 per project per day |
| Impact: file types | `.js .jsx .ts .tsx .mjs .cjs` |
| Impact: skipped | dependency folders, build output, minified files, files over 200 KB |
| Impact: files per repo | first 400, then marked partial |

The owner is exempt from the per-user limits and from no others.

### Screens

Five, with its own visual identity (the scaffold's themes are placeholders): light, dense,
developer-tool style, one accent colour, monospace for versions and package names. Every screen
has designed empty, loading and error states, and must not break on a narrow window.

- **Landing.** What it does, a link to the public example project, sign-in. Static; uses no
  data or auth hooks.
- **Projects list.** The user's projects, each with its count of unreviewed breaking upgrades
  and scan status; add project.
- **Project page.** Grouped dependencies; live scan progress; scan now; check this one; mark as
  reviewed and undo; the collapsed reviewed section; limit and failure notices; impact results
  under each breaking change when the stretch lands.
- **Project settings.** Alert switch, test email, send log, public switch with the shareable
  link, delete.
- **Public project view.** The project page with every action removed.

### Billing configuration

The GitHub and email integrations are owner-billed. No integration is callable by signed-out
visitors. No end-user OAuth integrations are used.

### Secrets

One secret: the unsubscribe signing key, kept in the app's secret store. Nothing secret is
committed, logged or sent to the browser. The app-owner token the platform writes to the local
settings file is never read by app code directly.

## Testing Decisions

**What a good test is here.** It exercises behaviour through a module's public interface and
would survive a rewrite of the internals. It names the rule it protects. It never calls a paid
service.

**The seam.** One: the scan engine's injected interfaces (registry, source host, judge, mailer,
record store, clock). Production passes real implementations; tests pass fakes.

**Three layers.**

- **Unit tests on the pure modules:** triage (range forms, `0.x`, prereleases, unscannable
  specs), changelog slicing (heading styles, range edges, the cut), verdict validation (accepts
  good, rejects malformed), limits (each rule at its boundary), alert composition (content,
  nothing-to-send, HTML and text parity), unsubscribe tokens (round trip, tampering), and for
  the stretch, import scanning and usage matching.
- **Engine tests with fakes:** whole scans in memory. Cache hit spends no judge call; the
  per-scan cap stops at 15 and reports the remainder; the daily ceiling stops judging but still
  triages; no changelog means no judge call; a bad judge response retries once then stores
  failed; a failed scan keeps old verdicts; an alert is sent once and never repeated; reviewed
  verdicts are not alerted; on-demand reads don't alert.
- **Browser tests against fake services:** the scaffold's smoke and API tests, plus signed-in
  flows using the SDK's testing fixture and two test accounts: add a project and watch its scan
  finish; mark reviewed and undo; a second user cannot see the first user's private project;
  a public project is readable signed-out and offers no actions; settings toggles persist.
  The local test server is started with a setting that selects the fakes. That setting is
  supplied only by the test runner's server command, and a unit test proves a production build
  has it off.

**The gate**, run before every commit: lint, type check, unit and engine tests, then the
browser tests. Order it fastest first.

**Outside the gate: the live check.** A command that runs one real scan of the fixed example
repo and sends one real test email, printing what it spent. Only the supervisor or Dustin runs
it: after the scan engine lands, after email lands, and before deploy. Workers never run it.

**Evidence.** Each ticket's completion records the gate's output. A ticket that changes a page
also records a screenshot of that page, which the supervisor looks at.

**Prior art.** The scaffold's smoke, API and two-user collaboration specs show the browser test
conventions. DeepSpace's ThreadHunt example shows engine tests around a resumable scan job, and
RunningMap shows dense unit tests on pure logic.

## Out of Scope

- Private repos, monorepos, nested `package.json` files, and reading lockfiles.
- Ecosystems other than npm.
- Peer and optional dependencies.
- Opening pull requests or changing anyone's code.
- Running or type-checking the user's code against new versions.
- AI in impact analysis; AI-written emails.
- A confidence score on verdicts.
- Billing end users, subscriptions, credits for sale, payments of any kind.
- Teams, shared projects, collaborators, comments, assignment.
- Full triage: multiple statuses, notes, filters, search, keyboard shortcuts.
- Weekly digests, send-time or frequency settings, custom sender addresses, open and click
  tracking, bounce and complaint handling, alerting any address other than the sign-in one.
- Account settings beyond what the scaffold provides; theme switching; a mobile-specific layout.
- AI chat, collaborative editing, presence, messaging, file storage, the knowledge base, and
  any integration not named above. The writeup explains each omission.
- A custom domain.

## Further Notes

- **Ticket order:** scan engine and data model; add-project flow; project page with triage;
  scheduling and limits; public sharing and landing; email alerts; polish and design; deploy
  checkpoint; then impact analysis. The core is deployed before the stretch starts, and the
  stretch is redeployed only if it lands green with time to spare.
- **Unverified, to confirm during the build:** how often the unauthenticated Releases fallback
  is refused from the platform's network (if unreliable, a token in the secret store slots in
  behind the same interface, and that is Dustin's decision); that the email integration passes
  through a `List-Unsubscribe` header; the true cost of one verdict (estimated at about one
  cent; read it from the account's usage after the first live check and retune the limits).
- **Example repo:** `dustinJ15/bumpcheck-example`, public, created 2026-11-23, with deliberately
  outdated dependencies (nine runtime, four dev) and source files that use APIs later majors
  changed (Express 4, Zod 3, chalk 4, node-fetch 2, date-fns 2). It backs the landing page's
  example and the live check, and stays stable because nobody upgrades it.
- **Already set up (2026-11-23), do not recreate:** the app is registered with DeepSpace; two
  test accounts exist on this machine with the label `bumpcheck` (display names Alice and Bob;
  the SDK's testing fixture finds them by name); the secret `UNSUBSCRIBE_SIGNING_KEY` is in the
  app's secret store.
- **Source control:** GitHub is the app's source authority. Never run the platform's own push
  command.
- **The writeup** must cover: what was built; which integrations were used and why (GitHub,
  Claude, email) and why the others were left out; the main tradeoff (shared verdict cache and
  semver-gated AI under a $5 budget); what the agent did; what Dustin verified himself.
