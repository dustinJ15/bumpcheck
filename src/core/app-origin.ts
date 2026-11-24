/**
 * The app's own origin: where the links in an email point.
 *
 * An alert is composed inside a scan job, which has no request to read an
 * origin from, so the origin comes from configuration:
 *
 *   - Deployed: `https://<APP_NAME>.app.space`. `APP_NAME` is a worker var
 *     in wrangler.toml, and it is the subdomain `deepspace deploy` puts the
 *     app on.
 *   - Local dev and test server: `BUMPCHECK_APP_ORIGIN`, which vite.config.ts
 *     sets to the local server's own address (`localOriginWorkerVars`), and
 *     only when vite is serving. A build never gets it, so an email from a
 *     deployed app cannot link to a local address.
 *
 * There is no fallback to a made-up address: with no usable app name the
 * answer is null and the caller sends nothing.
 *
 * Pure: no platform imports, so vite.config.ts can import it too.
 */

export const APP_ORIGIN_SETTING = 'BUMPCHECK_APP_ORIGIN'

/** The port the platform CLI uses for the local server when none is given. */
const DEFAULT_LOCAL_PORT = '5173'

export function appOrigin(env: { APP_NAME?: string; [APP_ORIGIN_SETTING]?: string }): string | null {
  const local = httpOrigin(env[APP_ORIGIN_SETTING])
  if (local !== null) return local
  // A subdomain label: letters, digits and hyphens.
  const name = env.APP_NAME ?? ''
  return /^[a-z0-9-]+$/i.test(name) ? `https://${name}.app.space` : null
}

/**
 * The worker vars vite adds for this run: the local server's own origin,
 * when vite is serving. The platform CLI passes the port it chose in
 * `DEEPSPACE_PORT`. For a build nothing is added, whatever the shell says.
 */
export function localOriginWorkerVars(
  viteCommand: 'serve' | 'build',
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  if (viteCommand !== 'serve') return {}
  return { [APP_ORIGIN_SETTING]: `http://127.0.0.1:${processEnv.DEEPSPACE_PORT ?? DEFAULT_LOCAL_PORT}` }
}

function httpOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}
