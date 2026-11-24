import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'

/**
 * THE LIVE CHECK. PAID. Run only by the supervisor or Dustin, with
 * `npm run live-check`. Never part of the gate, never run by a loop worker.
 *
 * This config differs from tests/playwright.config.ts in exactly the way
 * that matters: the local server is started WITHOUT the fake-services
 * setting, so the worker uses real GitHub, real npm, real Claude and the
 * real email integration, billed to the app owner's account.
 *
 * Its one test file ends in `.live.ts`, not `.spec.ts`, so the normal test
 * config (and so the gate, and `deepspace test run`) can never pick it up.
 */
const PORT = Number(process.env.DEEPSPACE_PORT ?? 5173)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: '.',
  testMatch: 'live-check.live.ts',
  outputDir: '../../.deepspace/live-check-results',
  timeout: 5 * 60_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    launchOptions: chromiumLaunchOptions(),
  },
  webServer: {
    // No `env` block here: real services. Compare tests/playwright.config.ts.
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    cwd: '../..',
    url: `${BASE_URL}/api/auth/ok`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
