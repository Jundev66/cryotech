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

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', '..', 'docs', 'screenshots');

const API = process.env.SHOTS_API_URL ?? 'http://localhost:3011/api';
const WEB = process.env.SHOTS_WEB_URL ?? 'http://localhost:3002';
// Generated per run: this seeds a real account through /auth/register.
const PASSWORD = `Zz${randomBytes(8).toString('hex')}.`;
const RATE = 250;

const stamp = Date.now();
let token = '';
let companyId = '';

async function call(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (companyId) headers['X-Company-Id'] = companyId;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const post = (path, body) => call('POST', path, body);
const patch = (path, body) => call('PATCH', path, body);
const get = (path) => call('GET', path);

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const round2 = (n) => Math.round(n * 100) / 100;

/** Kilos per bird per week, from a broiler's intake curve. */
const WEEKLY_FEED_KG = [0.15, 0.35, 0.6, 0.85, 1.05, 1.2];
const feedForWeek = (week, birds) => round2((WEEKLY_FEED_KG[week - 1] ?? 1.2) * birds);

async function seed() {
  const auth = await post('/auth/register', {
    email: `capturas-${stamp}@cryotech.test`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    fullName: 'Granja Demo',
  });
  token = auth.accessToken;

  const company = await post('/companies', { name: 'Granja Demo' });
  companyId = company.id;

  // Without a rate there is no conversion, and half the screens show bolivares.
  await call('PUT', '/exchange-rates/config', { rateSource: 'custom', customRate: RATE, autoFetch: false });

  const warehouse = await post('/warehouses', { name: 'Galpón 1', capacity: 600 });
  const [categories, units] = await Promise.all([
    get('/product-categories'),
    get('/measurement-units'),
  ]);
  const categoryId = (slug) => categories.find((c) => c.slug === slug)?.id ?? categories[0].id;
  const kg = units.find((u) => u.abbreviation === 'kg')?.id ?? units[0].id;

  const feed = await post('/products', {
    name: 'Alimento Engorde',
    categoryId: categoryId('feed'),
    unitId: kg,
    productType: 'consumable',
    currentStock: 0,
    minStock: 50,
  });

  const account = await post('/treasury/accounts', {
    name: 'BDV Bs',
    kind: 'bank',
    currency: 'VES',
    isActive: true,
    identifiers: [],
  });
  const cash = await post('/treasury/accounts', {
    name: 'Caja Bs',
    kind: 'cash',
    currency: 'VES',
    isActive: true,
    identifiers: [],
  });

  const clients = [];
  for (const name of ['Panadería La Espiga', 'Restaurante El Fogón', 'Carnicería Central']) {
    clients.push(await post('/clients', { name }));
  }

  // Two batches: one mature with history, one just started.
  const batches = [];
  for (const spec of [
    { breed: 'Cobb 500', quantity: 300, age: 38, status: 'for_sale' },
    { breed: 'Ross 308', quantity: 250, age: 12, status: 'breeding' },
  ]) {
    const batch = await post('/batches', {
      warehouseId: warehouse.id,
      breed: spec.breed,
      startDate: daysAgo(spec.age),
      initialQuantity: spec.quantity,
      purchasePricePerUnit: 45,
    });
    await patch(`/batches/${batch.id}/status`, { status: 'breeding' });
    if (spec.status === 'for_sale') await patch(`/batches/${batch.id}/status`, { status: 'for_sale' });
    batches.push({ ...batch, ...spec });
  }

  // Feed purchase, received: without receiving it there is no stock and no expense.
  const entry = await post('/entries', {
    productId: feed.id,
    quantity: 1500,
    totalCost: 600_000,
    entryDate: daysAgo(40),
    supplierName: 'Distribuidora Agropecuaria',
  });
  await patch(`/entries/${entry.id}/receive`, {});

  // Daily logs: rising weight and a small, uneven mortality.
  for (const batch of batches) {
    for (let day = 7; day <= batch.age; day += 7) {
      const weight = Math.round(40 + day * day * 0.85 + day * 12);
      await post('/daily-logs', {
        batchId: batch.id,
        logDate: daysAgo(batch.age - day),
        mortality: day % 21 === 0 ? 2 : day % 14 === 0 ? 1 : 0,
        averageWeightG: weight,
        feedConsumedKg: feedForWeek(day / 7, batch.quantity),
        healthScore: 4,
      });
    }
  }

  const mature = batches[0];

  // Approved feed consumptions: the FCR chart reads `feed_consumptions`, not
  // the kilos on the daily log.
  for (let day = 7; day <= mature.age; day += 7) {
    const consumption = await post('/feed/consumptions', {
      batchId: mature.id,
      productId: feed.id,
      consumptionDate: daysAgo(mature.age - day),
      quantityKg: feedForWeek(day / 7, mature.quantity),
    });
    await patch(`/feed/consumptions/${consumption.id}/approve`, {});
  }

  // Two collected, one half paid and one on credit, so the sales screen shows
  // every payment state it can render.
  const sales = [
    { client: clients[0], quantity: 60, kilos: 138, paid: 'full', days: 12 },
    { client: clients[1], quantity: 45, kilos: 104, paid: 'full', days: 8 },
    { client: clients[2], quantity: 50, kilos: 118, paid: 'half', days: 4 },
    { client: clients[0], quantity: 40, kilos: 92, paid: 'none', days: 1 },
  ];

  for (const sale of sales) {
    const total = round2(sale.kilos * 4);
    const created = await post('/sales', {
      batchId: mature.id,
      clientId: sale.client.id,
      saleType: 'live',
      quantity: sale.quantity,
      weightKg: sale.kilos,
      pricePerKg: 4,
      totalAmount: total,
      exchangeRate: RATE,
      saleDate: daysAgo(sale.days),
    });

    if (sale.paid === 'none') continue;
    const amount = sale.paid === 'full' ? total : round2(total / 2);
    await post(`/sales/${created.id}/payments`, {
      amount,
      amountBs: round2(amount * RATE),
      exchangeRate: RATE,
      paymentDate: daysAgo(Math.max(sale.days - 1, 0)),
      accountId: account.id,
      reference: `05871234${sale.quantity}`,
    });
  }

  // Cash movements, so treasury shows two accounts with activity.
  await post('/treasury/movements', {
    accountId: cash.id,
    direction: 'out',
    amount: 18_500,
    movementDate: daysAgo(6),
    concept: 'Flete del alimento',
  });
  await post('/treasury/movements', {
    accountId: cash.id,
    direction: 'in',
    amount: 60_000,
    movementDate: daysAgo(20),
    concept: 'Aporte del propietario',
  });

  return { auth, batchId: mature.id };
}

const SHOTS = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'reports', path: '/dashboard/reports' },
  { name: 'sales', path: '/dashboard/sales' },
  { name: 'treasury', path: '/dashboard/treasury' },
];

async function capture({ auth, batchId }) {
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
console.log(`Empresa de demostración ${companyId} sembrada.`);
await capture(seeded);
console.log('\nListo. Las capturas están en docs/screenshots/.');
