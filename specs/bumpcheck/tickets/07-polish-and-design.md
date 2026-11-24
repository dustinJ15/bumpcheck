# 07 — Polish and design

**Status:** ready-for-agent

**Who:** worker · **Changes a page:** yes · **Blocked by:** 06
**Stories:** all screens; 56 · **Ledger:** B.28, B.31

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

## Goal

The app looks like one deliberate product, every screen handles its edge states, and the repo
is ready for a reader. No new behaviour.

## Build

**Visual identity** across the five screens (landing, projects list, project page, project
settings, public project view): light, dense, developer-tool style, one accent colour,
monospace for versions and package names. The scaffold's themes are placeholders; replace
them with one theme and remove theme switching.

**States:** each screen has designed empty, loading and error states. Check each one, and fix
any that fall back to scaffold defaults or a blank area.

**Narrow window:** no screen breaks or scrolls sideways at a 390-pixel-wide viewport. This is
"does not break", not a mobile-specific layout.

**Scaffold leftovers:** remove or hide what bumpcheck does not use: the api-status page and
its tests, the scaffold home page, unused nav entries, AI chat routes and tools, unused UI
components, placeholder SEO text. Remove only what nothing imports, and keep the scaffold's
layout. If removing something breaks the gate in a way that is not obvious, leave it and note
it.

**Copy pass:** every user-facing message is specific and plain. Limit and failure notices say
what happened and what the user can do.

**README:** what bumpcheck is, how to run it locally (`nvm use`, install, dev server, the
gate), where the limits live, and that the live check and deploys are run by hand by Dustin.
No licence file.

**Writeup draft** (`WRITEUP.md`): what was built; which integrations were used and why
(GitHub, Claude, email) and why each other one was left out; the main tradeoff (shared verdict
cache and semver-gated AI under a $5 budget); what the agent did. Leave "What Dustin verified
himself" as an empty heading for Dustin. State only what is true of the code as it stands.

**Added by the supervisor from ticket 05:**

- Check what a signed-out visitor and another signed-in member receive if they ask the record
  room for the `users` collection (the scaffold leaves it on the platform default). Nobody but
  the user themself and the app owner should be able to read another user's name or email. If
  the schema can restrict it without breaking sign-in or the nav's own-identity chip, restrict
  it and add a browser test; if it cannot, say exactly what is exposed in the report.
- The scaffold's "Your account" `/settings` page still sits in the nav beside the per-project
  settings. Rename or regroup so the two are not confused.

## Tests required

No new behaviour, so no new rules to protect. All existing tests must still pass. Update
selectors only where markup changed. Do not weaken or delete a test to make it pass.

## Done means

Acceptance: the items above; the gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and
screenshots from `npx deepspace test screenshot` of all five screens at the default viewport
and at `--viewport=390x844`, plus one empty state and one error state, saved under
`specs/bumpcheck/evidence/07/`. The supervisor looks at every one.
