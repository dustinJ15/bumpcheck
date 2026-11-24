# bumpcheck

bumpcheck tells you which of a JavaScript project's dependency upgrades will break. Point it at a
public GitHub repo: it reads the root `package.json`, works out how far behind each npm dependency
is, and for the upgrades likely to hurt (major versions, and `0.x` minors) it reads the changelog
with Claude and gives a verdict: breaking, safe or unclear, with what changed and what to do about
each change. Minor and patch upgrades are listed as "not read" unless you ask for one. It re-scans
daily, can email you when a new breaking upgrade appears, and can share a project's report
publicly with a link.

It is built on [DeepSpace](https://deep.space) (records, server actions, a job room, a cron room,
the GitHub, Claude and email integrations, the secret store) and runs on Cloudflare Workers. The
whole app runs on one account with a US$5 budget; see "Limits" below.

- Specification and decisions: [`specs/bumpcheck/spec.md`](specs/bumpcheck/spec.md),
  [`specs/bumpcheck/interview-ledger.md`](specs/bumpcheck/interview-ledger.md)
- How it was built, ticket by ticket: [`specs/bumpcheck/tickets/`](specs/bumpcheck/tickets/)
- Writeup: [`WRITEUP.md`](WRITEUP.md)

## Run it locally

Needs Node 24 (pinned in `.nvmrc`) and a DeepSpace login (`npx deepspace auth login`).

```sh
nvm use          # Node 24, in every new shell
npm install
npm run dev      # local dev server (vite + miniflare), real services
npm run gate     # lint, type check, unit and engine tests, then the browser tests
```

`npm run dev` talks to the **real** GitHub, Claude and email integrations, billed to the app
owner's account. The browser tests never do (see below).

`npm run gate` is the check run before every commit. In order, fastest first: ESLint, `tsc`,
vitest (unit and engine tests), then the Playwright suites `smoke`, `api` and the signed-in specs
(`projects`, `project-page`, `sharing`, `alerts`, `scheduling`, which must stay last because it
empties the test accounts). It takes about eight minutes. The signed-in specs need two DeepSpace
test accounts named Alice and Bob on the machine (`npx deepspace test accounts list`).

`tests/evidence.spec.ts` is not part of the gate. It captures the five screens, wide and at
390 px, and checks that none scrolls sideways:

```sh
BUMPCHECK_EVIDENCE=specs/bumpcheck/evidence/07 npx deepspace test run tests/evidence.spec.ts
```

## Where things are

| Path | What |
|---|---|
| `src/config.ts` | **Every limit and cap**: projects per user, verdicts per scan, AI calls per day, cooldowns, schedule, model, token caps |
| `src/core/` | Pure rules, no platform imports: triage, changelog slicing, the verdict contract, limits, report grouping, the alert email, unsubscribe tokens |
| `src/engine/` | The scan engine, alert step and schedule tick, written against interfaces so tests run them with fakes |
| `src/services/` | The interfaces (`types.ts`), their real implementations, the fakes, and `wire.ts`, the one place that picks real or fake |
| `src/actions/` | Server actions: every write a user can ask for, each checking the caller, ownership and limits first |
| `src/schemas/` | Record collections and their read rules |
| `src/jobs.ts`, `src/cron.ts` | The scan job and the hourly schedule, both thin |
| `src/pages/`, `src/components/` | The five screens: landing, projects, project, project settings, public report |
| `worker.ts`, `src/server/` | Worker routes, the locked job and cron rooms, the unsubscribe route |

## Fake services and the live check

Browser tests run against fake GitHub, npm, Claude and email (`src/services/fakes.ts`,
`src/services/fake-world.ts`). The switch is the environment setting `BUMPCHECK_FAKE_SERVICES`,
read in one function (`src/services/mode.ts`). Only the test runner's local server sets it
(`tests/playwright.config.ts`); a build never forwards it, and a unit test proves that. So no test
can spend money.

The real services are exercised by the **live check**, `npm run live-check`. It is **paid**: it
runs one real scan of [`dustinJ15/bumpcheck-example`](https://github.com/dustinJ15/bumpcheck-example)
(a repo with deliberately outdated dependencies) as the Alice test account, retries any failed
verdict once, sends one real test email, prints what was spent, and deletes the project again. One
run cost 7.9 credits (about US$0.08). It is run by hand only, never by the tests or by a build
agent.

## Deploying

Deploys are done by hand with `npx deepspace deploy`. GitHub is the source authority for this
app, so `npx deepspace push` (the platform's own git remote) is not used.

One secret is needed in the app's secret store: `UNSUBSCRIBE_SIGNING_KEY`, which signs the
one-click unsubscribe links in alert emails. Without it no alert is sent and the unsubscribe route
refuses every link.

After the first deploy, the landing page's "See an example report" needs the id of a public
project on the live site: add `dustinJ15/bumpcheck-example`, make it public in its settings, and
put the last part of its share link in `EXAMPLE_PROJECT_ID` (`src/config.ts`), then deploy again.
