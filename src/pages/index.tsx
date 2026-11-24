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
import { EXAMPLE_PROJECT_ID } from '../config'
import { APP_NAME } from '../constants'
import { shareLinkPath } from '../core/public-report'
import { seo } from '../seo'

/** How a verdict reads, shown as three short lines under the pitch. */
const VERDICTS = [
  { label: 'Breaking', text: 'what changed, and what to do about each change' },
  { label: 'Safe', text: 'a major version that will not touch your code' },
  { label: 'Unclear', text: 'the changelog was too vague, so it does not guess' },
]

const SIGN_IN_LINK =
  'inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        <h1 className="font-mono text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{APP_NAME}</h1>
        <p data-testid="landing-pitch" className="mt-5 max-w-xl text-lg text-foreground">
          Point bumpcheck at a public GitHub repo and it reads the changelogs of your outdated npm dependencies to tell you which
          upgrades will break.
        </p>

        <ul className="mt-8 w-full max-w-xl divide-y divide-border rounded-lg border border-border bg-card text-left text-sm">
          {VERDICTS.map((verdict) => (
            <li key={verdict.label} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-3">
              <span className="w-20 shrink-0 font-mono font-semibold text-foreground">{verdict.label}</span>
              <span className="text-muted-foreground">{verdict.text}</span>
            </li>
          ))}
        </ul>

        <Link
          to={shareLinkPath(EXAMPLE_PROJECT_ID)}
          data-testid="landing-example-link"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          See an example report
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">A real report, no account needed.</p>

        <div className="mt-8 flex w-full max-w-xl flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <a href="/api/auth/social-redirect?provider=github" className={SIGN_IN_LINK}>
            Sign in with GitHub
          </a>
          <a href="/api/auth/social-redirect?provider=google" className={SIGN_IN_LINK}>
            Sign in with Google
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Signing in lets you add your own repos. Already signed in?{' '}
          <Link to="/projects" className="underline underline-offset-4 hover:text-foreground">
            Open your projects
          </Link>
          .
        </p>
      </div>
    </>
  )
}
