# 08 — Deploy checkpoint

**Status:** ready-for-human (no worker; supervisor and Dustin only)

**Who:** supervisor and Dustin only. **No worker is assigned to this ticket.**
**Changes a page:** no · **Blocked by:** 07 · **Decisions:** 16, 17

A worker that is handed this ticket must stop and report. It involves a deploy, the live
check, paid calls and account usage, all of which are outside worker rules.

## Goal

The core is live and verified before the stretch starts. Impact analysis (tickets 09 and 10)
does not begin until this ticket is closed.

## Steps

Use Node 24 (`nvm use`) for every command.

1. **Supervisor:** on a clean tree at the commit to be deployed (`ralph/bumpcheck`, or `main` once Dustin has merged), run `npm run gate`. Paste the full output below. Stop if
   it is not green.
2. **Supervisor or Dustin:** run `npm run live-check` (one real scan of
   `dustinJ15/bumpcheck-example`, one real test email). Record what it printed as spent.
3. **Dustin:** read the account's usage. Record the true cost of one verdict. If it differs
   much from the one-cent estimate, retune the limits in the config module, rerun the gate,
   and commit.
4. **Dustin:** settle the two unverified items from the spec:
   - Was the unauthenticated Releases fallback refused? If it is unreliable, deciding whether
     a token goes in the secret store is Dustin's call.
   - Did the test email arrive with a `List-Unsubscribe` header, and does the plain-text part
     match the HTML?
5. **Dustin:** deploy by hand. Never `deepspace push`; GitHub is the source authority.
6. **Dustin:** on the live app: sign in; add `dustinJ15/bumpcheck-example`; watch the scan
   finish; make it public; open the public link signed out; set the landing page's example
   constant to that project and redeploy if it changed; send a test email and use its
   unsubscribe link.
7. **Dustin:** confirm remaining credits leave room for the stretch and the grading period.

## Done means

- The full pasted output of `npm run gate` from the deployed commit, all green.
- The live check's printed spend, the measured cost per verdict, and remaining credits.
- The answers to the two unverified items.
- The deployed commit hash and the live URL.
- Dustin's go or no-go on starting tickets 09 and 10, given the time left before the deadline
  (Wednesday 2026-11-25, 11:59 PM Eastern).

No screenshot is required by rule, since no page changes; Dustin's check of the live pages in
step 6 stands in for it.

## Completion

*(filled in by the supervisor and Dustin)*
