import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3002';

export default defineConfig({
  testDir: './e2e',
  // The suite works through one company's data, so tests that run at the same
  // time would see each other's records. Sequential is also how a real user
  // works, which is what these tests are supposed to imitate.
  workers: 1,
  fullyParallel: false,
  // A `test.only` left in a spec shrinks the run to one test and CI still
  // reports green. On a laptop that is a convenience; here it is a lie.
  forbidOnly: !!process.env.CI,
  // One retry, CI only. It is not free: the suite is serial and stateful, so a
  // retry runs against whatever the failed attempt already wrote. It earns its
  // place against runner failures — a cold Vite chunk on the first navigation —
  // not against a real bug, which a second retry would only paper over.
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // `github` annotates the failing line in the diff; `html` is what gets
  // uploaded and the only way to open a trace once the runner is gone.
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],
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

  // Reuses `make dev` during development. In CI there is nothing legitimate to
  // reuse: `true` would let Playwright adopt a server left over from an earlier
  // step — serving an earlier commit's bundle — instead of failing.
  webServer: {
    command: 'pnpm exec vite --port 3002',
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
