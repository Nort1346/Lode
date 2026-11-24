// @ts-check
import { defineConfig } from '@playwright/test'

// Lode E2E suite.
//
// The server lifecycle is NOT handled by Playwright's webServer on purpose:
// the app needs a freshly migrated + seeded isolated SQLite database and a
// local mock TMDB server before it can start. e2e/global-setup.ts provisions
// all of that (see e2e/global-setup.ts) and e2e/global-teardown.ts tears the
// child processes down again.

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  // Single shared database: run files serially, one worker at a time.
  fullyParallel: false,
  workers: 1,

  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,

  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'e2e/test-results',

  use: {
    baseURL: 'http://127.0.0.1:5758',
    // The PWA service worker is disabled in the test browser: it would cache
    // assets and intercept navigation in ways that are irrelevant to the flows
    // under test.
    serviceWorkers: 'block',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off'
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ]
})
