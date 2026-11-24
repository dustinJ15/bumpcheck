/**
 * Landing page: what bumpcheck does in one sentence, a link to a public
 * example report, and sign-in (stories 1 to 3).
 *
 * A STATIC page. It lives at the top level of src/pages/ (not under (app)/),
 * so it renders with no DeepSpace providers: no auth session fetch, no
 * records WebSocket. It uses no data hook and no auth hook, and must not:
 * prerender.test.ts fails if it calls one, and the smoke tests fail if the
 * page makes an auth request or opens a room connection.
 *
 * That is why the two sign-in buttons are plain links. They point at the
 * worker's own sign-in route (src/server/http-routes.ts), which sends the
 * browser to GitHub or Google and brings it back signed in at /home.
 * Nothing runs until one is pressed.
 *
 * The example report's id is one constant: EXAMPLE_PROJECT_ID in
 * src/config.ts, which says what to change after the first deploy.
 *
 * Top-level pages are also prerendered to static HTML at build
 * (prerender.ts, via vite.config.ts) so crawlers read real content.
 * Keep it renderable without a browser: no window/document during render.
 * `<Seo>` comes first and reads src/seo.ts.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Wordmark } from '../components/Wordmark'
import { EXAMPLE_PROJECT_ID, LIMITS } from '../config'
import { shareLinkPath } from '../core/public-report'
import { seo } from '../seo'

/**
 * How a report reads, drawn as three rows of one. An illustration of the
 * format, labelled as such on the page: the real thing is the example
 * report behind the button.
 */
const SAMPLE_ROWS = [
  {
    name: 'express',
    versions: '4.21.2 → 5.1.0',
    label: 'Breaking',
    tone: 'border-destructive/25 bg-destructive/10 text-destructive',
    text: 'what changed, and what to do about each change',
  },
  {
    name: 'zod',
    versions: '3.23.8 → 4.1.12',
    label: 'Unclear',
    tone: 'border-warning/30 bg-warning/10 text-warning',
    text: 'the changelog was too vague, so it does not guess',
  },
  {
    name: 'dotenv',
    versions: '16.4.5 → 17.2.3',
    label: 'Safe',
    tone: 'border-success/25 bg-success/10 text-success',
    text: 'a major version that will not touch your code',
  },
]

/** What happens after you add a repo, in order. */
const STEPS = [
  'Reads the root package.json of a public GitHub repo.',
  'Sorts every dependency by how far behind it is. Minor and patch upgrades are listed as "not read", not as safe.',
  'Reads the changelog of each major upgrade and gives a verdict, with a link to what it read.',
  'Scans again every day, and can email you when a new breaking upgrade appears.',
]

const SIGN_IN_LINK =
  'inline-flex items-center justify-center rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex h-12 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
            <Wordmark />
            <Link to="/projects" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Your projects
            </Link>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
          <section>
            <h1 className="text-4xl sm:text-5xl">
              <Wordmark size="lg" />
            </h1>
            <p data-testid="landing-pitch" className="mt-5 max-w-2xl text-lg leading-relaxed text-foreground">
              Point bumpcheck at a public GitHub repo and it reads the changelogs of your outdated npm dependencies to tell you which
              upgrades will break.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to={shareLinkPath(EXAMPLE_PROJECT_ID)}
                data-testid="landing-example-link"
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                See an example report
              </Link>
              <p className="text-xs text-muted-foreground">A real report of a real repo. No account needed.</p>
            </div>
          </section>

          <section aria-labelledby="sample-title">
            <h2 id="sample-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              How a report reads <span className="font-normal normal-case tracking-normal">(an illustration)</span>
            </h2>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card text-left text-sm shadow-sm">
              {SAMPLE_ROWS.map((row) => (
                <li key={row.name} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono font-medium">{row.name}</span>
                    <span className={`inline-flex items-center rounded-sm border px-1.5 py-px text-[11px] leading-4 font-medium ${row.tone}`}>
                      {row.label}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{row.versions}</span>
                  </div>
                  <span className="text-muted-foreground">{row.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="steps-title">
            <h2 id="steps-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What it does
            </h2>
            <ol className="mt-2 space-y-2 text-sm">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="w-5 shrink-0 font-mono text-muted-foreground">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="sign-in-title" className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
            <h2 id="sign-in-title" className="text-base font-semibold">
              Check your own repos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with GitHub or Google to add up to {LIMITS.projectsPerUser} public repositories. There is no password to create.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <a href="/api/auth/social-redirect?provider=github" className={SIGN_IN_LINK}>
                Sign in with GitHub
              </a>
              <a href="/api/auth/social-redirect?provider=google" className={SIGN_IN_LINK}>
                Sign in with Google
              </a>
            </div>
          </section>
        </main>
      </div>
    </>
  )
}
