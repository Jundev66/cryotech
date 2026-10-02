import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*mobile-chat\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3003',
    ...devices['Pixel 5'],
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
  },
  webServer: {
    command: 'pnpm --filter @cryotech/mobile dev',
    url: 'http://localhost:3003',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
