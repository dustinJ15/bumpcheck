/**
 * Real or fake services? One setting decides.
 *
 * `BUMPCHECK_FAKE_SERVICES` set to exactly "true" selects the fakes in
 * ./fakes.ts: no GitHub, npm, Claude or email call is made. Anything else,
 * including the setting being absent, selects the real implementations.
 * The default is real.
 *
 * Where it is set: only in the Playwright `webServer` block of
 * tests/playwright.config.ts, for the local test server. vite.config.ts
 * passes it through to the worker's env for the dev server only
 * (`fakeServicesWorkerVars`), never for a build, so a production build
 * (which is what `deepspace deploy` ships) always runs real services.
 *
 * Pure: no platform imports, so vite.config.ts can import it too.
 */

export const FAKE_SERVICES_SETTING = 'BUMPCHECK_FAKE_SERVICES'

export type ServicesMode = 'real' | 'fake'

/** The one decision: which implementations this worker uses. */
export function servicesMode(env: Partial<Record<typeof FAKE_SERVICES_SETTING, string>>): ServicesMode {
  return env[FAKE_SERVICES_SETTING] === 'true' ? 'fake' : 'real'
}

/**
 * The worker vars vite adds for this run. The setting is forwarded from the
 * shell only when vite is serving (the local dev or test server). For a
 * build it is never forwarded, whatever the shell says.
 */
export function fakeServicesWorkerVars(
  viteCommand: 'serve' | 'build',
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  if (viteCommand !== 'serve') return {}
  return processEnv[FAKE_SERVICES_SETTING] === 'true' ? { [FAKE_SERVICES_SETTING]: 'true' } : {}
}
