# 10 — Impact analysis: job and page

**Status:** ready-for-agent

**Who:** worker for the build; the redeploy is a supervisor/Dustin step
**Changes a page:** yes · **Blocked by:** 09
**Stories:** 52–55 · **Decisions:** 12, 15, 16

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

This is the second half of the stretch. The deployed core must keep working whether or not
this ticket ships.

## Goal

Under each breaking change, the project page says whether the user's code likely uses the
affected APIs, and links to the lines.

## Build

**Impact job** (`src/jobs.ts`): a job type `impact` carrying only a project id. It runs
ticket 09's engine one step per budget of outbound calls and continues across ticks. It is
enqueued by server code after a scan finishes with at least one breaking verdict. Like scans,
only the owner role can enqueue it. It makes no AI call and sends no email.

**Failure is contained:** an impact job that fails leaves the scan's results and verdicts
untouched, and the page shows "can't tell" with the reason rather than an error screen.

**Project page**, under each breaking change:

- "Your code likely uses this": the files and line numbers, each linked to GitHub at the
  analysed commit.
- "No usage found", shown distinctly from "can't tell".
- A notice when only part of the repo was analysed.
- A quiet "analysing" state while the job runs.

**Public project view:** shows the same impact results, read-only.

**Writeup and README:** add the stretch to `WRITEUP.md` and the README, stating what it does
and does not do (identifier matching, not type analysis).

## Tests required

- Unit: the GitHub link builder (file, line, commit).
- Browser, against the fakes: a breaking change shows usage with links; another shows "no
  usage found"; a partial result shows its notice; the public view shows results and no
  actions.
- Engine or job-level: a failing impact run leaves scan results intact.

## Supervisor/Dustin step after this ticket (not worker work)

Redeploy only if the gate is green and there is time to spare before the deadline. Dustin
deploys by hand and checks the example project's impact results on the live app. If either
condition fails, the deployed core from ticket 08 stands and the writeup says the stretch was
not shipped.

## Done means

Acceptance: the behaviours above hold against the fakes; the gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and
screenshots from `npx deepspace test screenshot` of the project page showing "usage found",
"no usage found", "can't tell" and the partial notice, saved under
`specs/bumpcheck/evidence/10/`.
