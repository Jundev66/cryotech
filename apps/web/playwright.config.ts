import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3002';

export default defineConfig({
  testDir: './e2e',
  // The suite works through one company's data, so tests that run at the same
  // time would see each other's records. Sequential is also how a real user
  // works, which is what these tests are supposed to imitate.
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: WEB_URL,
    // Saved by globalSetup: the three localStorage keys the app reads, so every
    // test starts already signed in to the test company instead of replaying
    // the login form.
    storageState: './e2e/.auth/state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Reuses whatever is already running — `make dev` during development, a fresh
  // server in CI. Starting a second one on the same port would just fail.
  webServer: {
    command: 'pnpm exec vite --port 3002',
    url: WEB_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
