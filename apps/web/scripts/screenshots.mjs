/**
 * Seeds a demo farm and photographs the screens for the README.
 *
 * A throwaway company each run, never the real books — the seed writes sales,
 * payments and daily logs. Needs the API on :3011 and the web on :3002.
 *
 *   node apps/web/scripts/screenshots.mjs
 */
import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, seedDemoFarm } from '../../../scripts/demo-farm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', '..', 'docs', 'screenshots');

const API = process.env.SHOTS_API_URL ?? 'http://localhost:3011/api';
const WEB = process.env.SHOTS_WEB_URL ?? 'http://localhost:3002';
// Generated per run: this seeds a real account through /auth/register.
const PASSWORD = `Zz${randomBytes(8).toString('hex')}.`;

const client = createClient(API);

async function seed() {
  const auth = await client.post('/auth/register', {
    email: `capturas-${Date.now()}@cryotech.test`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    fullName: 'Granja Demo',
  });
  client.state.token = auth.accessToken;

  const { companyId, matureBatchId } = await seedDemoFarm(client);
  return { auth, companyId, batchId: matureBatchId };
}

const SHOTS = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'reports', path: '/dashboard/reports' },
  { name: 'sales', path: '/dashboard/sales' },
  { name: 'treasury', path: '/dashboard/treasury' },
];

async function capture({ auth, companyId, batchId }) {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Scale 1: at 2 the ten screenshots weigh 15 MB in the repository.
    deviceScaleFactor: 1,
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
  });

  await context.addInitScript(
    ([accessToken, refreshToken, company]) => {
      localStorage.setItem('cryotech_access_token', accessToken);
      localStorage.setItem('cryotech_refresh_token', refreshToken);
      localStorage.setItem('cryotech_company_id', company);
    },
    [auth.accessToken, auth.refreshToken, companyId],
  );

  const page = await context.newPage();
  const targets = [...SHOTS, { name: 'batch-detail', path: `/dashboard/batches/${batchId}` }];

  for (const theme of ['light', 'dark']) {
    await page.addInitScript((value) => localStorage.setItem('cryotech-theme', value), theme);

    for (const shot of targets) {
      await page.goto(`${WEB}${shot.path}`);
      await page.waitForLoadState('networkidle');

      // The two charts on Reportes stay empty until a batch is picked, and the
      // mature one is the only one with enough history to draw.
      if (shot.name === 'reports') {
        await page.getByRole('combobox').first().click();
        await page.getByRole('option', { name: /Cobb 500/ }).click();
        await page.waitForLoadState('networkidle');
      }

      // Recharts animates on mount; without this the chart is caught half drawn.
      await page.waitForTimeout(1200);

      const file = join(OUT, `${shot.name}${theme === 'dark' ? '-dark' : ''}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`  ${file}`);
    }
  }

  await browser.close();
}

const seeded = await seed();
console.log(`Empresa de demostración ${seeded.companyId} sembrada.`);
await capture(seeded);
console.log('\nListo. Las capturas están en docs/screenshots/.');
