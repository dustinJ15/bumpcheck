# 05 — Public sharing and landing

**Status:** ready-for-agent

**Who:** worker · **Changes a page:** yes · **Blocked by:** 04
**Stories:** 1, 2, 4, 47–50 · **Decisions:** 14

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

## Goal

A user can share a report with a link that is safe to pass around, and a visitor can see real
output before signing in.

## Build

**Visibility action:** sets a project private or public, after verifying the caller and
ownership. Private is the default.

**Read rule:** the projects schema's visibility field plus the platform's "published" read
rule lets signed-out visitors (viewer role) and other members read public projects. This is
enforced by the server, not by hiding things in the page.

**Public project view:** the project page with every action removed: no scan now, no check
this one, no reviewed, no retry, no link to settings. Share as much rendering code with the
owner's page as stays readable.

**No identity on public pages.** A public project must not expose its owner's id, name or
email. The owner field is needed for owner reads, so check what a viewer-role client actually
receives and keep identity out of it. If the platform cannot hide the owner field from
viewers, stop and report rather than work around it.

**"Not available" page:** a signed-out visitor or another member on a private or missing
project's link gets a clear page, not a blank screen. Do not reveal whether the project exists.

**Public switch** with the shareable link. It lives on the project settings page that ticket
06 fills in; create that page here with just this control.

**Landing page** (`src/pages/index.tsx`): one sentence on what bumpcheck does, a link to the
public example project, and sign-in with GitHub or Google. Static: no data hooks, no auth
hooks. The example project's id comes from one constant, which Dustin sets after the first
deploy; until then the link points at a local fixture project.

## Tests required

- Browser: a public project is readable signed-out and offers no actions; a private project's
  link shows "not available" signed-out and to Bob; switching back to private removes access;
  the public page's received data contains no owner id, name or email.
- Unit: the landing page renders without data or auth hooks (extend the prerender test).

## Done means

Acceptance: the behaviours above hold; the gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below, and
screenshots from `npx deepspace test screenshot` of the landing page, the public project view,
the "not available" page, and the settings page's public switch, saved under
`specs/bumpcheck/evidence/05/`.
