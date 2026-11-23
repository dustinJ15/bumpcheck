# bumpcheck — interview ledger

*For: anyone who needs to know why the spec says what it says. This is the record of the
2026-11-23 `/grill-me` session and is the authority on intent. Dustin confirmed it stands.*

## A. Decisions Dustin made

1. **Input:** a public GitHub repo only; root `package.json` on the default branch; no monorepos.
2. **AI spend:** semver triage first, AI on major bumps (and `0.x` minors), with an on-demand
   "check this one" for the rest. `dependencies` and `devDependencies` only.
3. **Verdicts:** one shared cache keyed by package, current major and target version; a new
   verdict only when the target's major or minor changes. Amended 2026-11-23 during the build:
   for a `0.x` current version the key uses `0.<minor>` instead of the major, so projects on
   different `0.x` minors do not share a verdict.
4. **Changelog source:** `CHANGELOG.md` through the GitHub integration, then the public
   Releases API as a best-effort free fallback; no text means no AI call.
5. **Verdict shape:** structured (breaking, safe or unclear; summary; changes with API names and
   a "what to do" note; source link), no confidence score; Haiku with output and input caps;
   one retry, then "failed".
6. **Budget:** 3 projects per user, 15 new AI verdicts per scan, 150 AI calls per day app-wide;
   sign-in required; the owner is exempt from per-user limits only.
7. **Public access:** per-project public switch, read-only, private by default, plus a public
   example on the landing page.
8. **Schedule:** daily per project through an hourly tick; scan on creation; "scan now" with a
   10-minute cooldown; paused after 7 idle days; one scan at a time per project.
9. **Email:** opt-in alert on new breaking verdicts, sent to the sign-in address. Dustin raised
   this from "last core ticket, first to cut" to **a primary feature**: "email notifications is
   a level of polish that should be important and I have a lot of experience with them."
10. **Email polish:** never send the same news twice; HTML with a plain-text alternative;
    content that stands on its own; one-click unsubscribe without signing in, plus the
    `List-Unsubscribe` header; a "send me a test" button; a send log per project; emails
    rendered by code, not AI. Left out: custom sender, open and click tracking, bounce
    handling, digest and frequency settings.
11. **Impact analysis:** code-only matching, with the file-type, size and pacing limits in the
    spec. It is the stretch.
12. **Interaction:** light triage with "mark as reviewed", across five screens.

## B. Decisions made by the agent on Dustin's instruction

Dustin said: "work through the entire rest of the grill me session on your own with your own
recs for each and every question", then confirmed the ledger stands.

13. **Gate:** lint, type check, unit and engine tests, then browser tests against fake services.
    Real services are checked by a separate live check the supervisor runs at three points.
14. **Evidence:** gate output per ticket, and a screenshot for every ticket that changes a page.
15. **Collections:** projects (owner-scoped, with the visibility field), verdicts (shared),
    alerts (the send log, owner-scoped) and a usage counter for the daily ceiling.
16. **All writes go through server actions.**
17. **Only the owner can enqueue jobs;** server actions enqueue scans after checking limits.
18. **Scan progress lives on the project row,** since members can't watch the job room.
19. **Job payloads carry only a project id.**
20. **Current version** is the lowest version the range allows; the lockfile isn't read. Target
    is npm's `latest` tag; prereleases ignored.
21. **Unscannable dependencies** are listed as "not checked", never dropped.
22. **Bad input is refused with a specific message:** repo not found or private, no
    `package.json`, invalid JSON, more than 150 dependencies.
23. **Duplicates:** one project per repo per user; different users can add the same repo.
24. **A failed scan** is retried once, then shown as failed with its reason and a retry button;
    stored verdicts are kept.
25. **Deleting a project** removes it and its send log; shared verdicts stay.
26. **Unsubscribe links are signed** with a key in the secret store; the page works without
    sign-in.
27. **Test sends:** 3 per user per day.
28. **Look:** its own identity: light, dense, developer-tool style, one accent colour,
    monospace for versions and package names; empty, loading and error states on every screen.
29. **Loop:** workers on `claude-fable-5-2` at medium effort (Dustin changed this on 2026-11-23,
    during the build, from `claude-opus-5-5` at high effort; ticket 01 ran on Opus), batches
    of 3, a supervising session, Dustin's usage meter asked for at each batch boundary.
30. **Ticket order:** scan engine and data model; add-project flow; project page with triage;
    scheduling and limits; public sharing and landing; email alerts; polish and design; deploy
    checkpoint; then impact analysis in two tickets.
31. **Repo:** a README; no licence file.

## B2. Decisions made by the supervisor during the build

Dustin, 2026-11-23: "this is a ralph loop. use your discretion to make these fixes and dont
stop and ask for my input again".

- **Minor and patch verdicts (ticket 03):** the verdict key is unchanged, but a cached verdict
  for a same-major upgrade applies only to a project whose current version is at or above the
  version the verdict was judged from. Otherwise a project on 4.2 would be shown "safe" from a
  verdict that only read 4.17.2 to 4.17.3.
- **Failed on-demand check (ticket 03):** leaves the project "done" with a "last check failed"
  notice instead of marking the whole project failed.
- **Add-project attempts (ticket 04):** capped at 20 per user per day, owner exempt, because
  each attempt costs GitHub calls even when refused.
- **Refused Releases requests (ticket 04):** store no shared verdict; the next scan tries again.
- **Test first (from ticket 03):** tickets README rule 12 and the supervisor's mutation check,
  at Dustin's request.

## C. Settled by exploration

- Fake services in browser tests are switched on by a setting only the test runner's local
  server gets; deploy never reads local settings.
- The platform's "published" read rule with a visibility field provides public read-only rows.
- Jobs always bill the owner; users cannot be billed from a job.
- Sign-in is GitHub or Google only.
- Jobs: 15 minutes per tick, one at a time, resumable.

## D. Account actions Dustin approved (2026-11-23)

- Two DeepSpace test accounts on this machine, for the signed-in browser tests.
- A second public GitHub repo, `bumpcheck-example`, with deliberately outdated dependencies.
- One signing key stored in the app's secret store, for unsubscribe links.

## Earlier decisions (before the grill)

- App name `bumpcheck`; public GitHub repo; impact analysis as a stretch after the core is
  deployed; roughly 8 to 10 tickets; deploys by hand only; Node 24 via nvm.
