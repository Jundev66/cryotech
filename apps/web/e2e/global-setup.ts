import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(HERE, '.auth', 'state.json');

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3011/api';
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3002';

/** Everything the suite creates carries this, so cleanup can find it. */
export const E2E_MARKER = 'E2E';
const E2E_PASSWORD = 'E2ePruebas.2026';

export interface E2EFixture {
  companyId: string;
  companyName: string;
  email: string;
  accessToken: string;
  warehouseId: string;
  batchId: string;
  batchCode: string;
  processedBatchId: string;
  processedBatchCode: string;
  processingBatchId: string;
  clientId: string;
  clientName: string;
  chickProductId: string;
  chickProductName: string;
  feedProductId: string;
  feedProductName: string;
  purchaseProductId: string;
  purchaseProductName: string;
  accountId: string;
  accountName: string;
}

/**
 * Builds a throwaway company and signs into it.
 *
 * Everything goes through the API rather than straight into Postgres, because
 * creating a company is not one INSERT: `CompaniesService.create` also seeds the
 * default roles, measurement units and product categories, and a company
 * without those breaks half the screens in ways that look like UI bugs.
 *
 * A fresh company per run, never *Granja Mata*. The suite files sales and
 * payments, and doing that against the real books would corrupt the accounts
 * this system exists to keep.
 */
async function globalSetup() {
  const stamp = Date.now();
  const email = `e2e-${stamp}@cryotech.test`;
  const companyName = `${E2E_MARKER} Granja ${stamp}`;

  const auth = await post('/auth/register', {
    email,
    password: E2E_PASSWORD,
    confirmPassword: E2E_PASSWORD,
    fullName: `${E2E_MARKER} Tester`,
  });

  const token = auth.accessToken as string;

  const company = await post('/companies', { name: companyName }, token);
  const companyId = company.id as string;

  // The minimum a farm needs before any screen has something to show. Created
  // here rather than in a test so a failing test never leaves the next one
  // without its fixtures.
  const warehouse = await post('/warehouses', { name: 'Galpón E2E', capacity: 500 }, token, companyId);

  const batch = await post(
    '/batches',
    {
      warehouseId: warehouse.id,
      breed: 'Cobb 500',
      startDate: isoDaysAgo(40),
      initialQuantity: 300,
    },
    token,
    companyId,
  );

  // Straight to for_sale: the suite sells and slaughters, and walking the whole
  // lifecycle here would test the setup rather than the screens.
  await patch(`/batches/${batch.id}/status`, { status: 'breeding' }, token, companyId);
  await patch(`/batches/${batch.id}/status`, { status: 'for_sale' }, token, companyId);

  // Un segundo lote para el spec que beneficia todo y deja el galpón vacío. Sin
  // él se comía el lote compartido y los specs que corren después se quedaban
  // sin aves que vender — fallando por el orden alfabético, no por su código.
  const processedBatch = await post(
    '/batches',
    {
      warehouseId: warehouse.id,
      breed: 'Hubbard',
      startDate: isoDaysAgo(45),
      initialQuantity: 40,
    },
    token,
    companyId,
  );
  await patch(`/batches/${processedBatch.id}/status`, { status: 'breeding' }, token, companyId);
  await patch(`/batches/${processedBatch.id}/status`, { status: 'for_sale' }, token, companyId);

  // Y otro para el spec de beneficio, por la misma razón: dos specs sacando
  // aves del mismo lote se rompen entre sí según el orden en que corran.
  const processingBatch = await post(
    '/batches',
    {
      warehouseId: warehouse.id,
      breed: 'Otro',
      startDate: isoDaysAgo(50),
      initialQuantity: 80,
    },
    token,
    companyId,
  );
  await patch(`/batches/${processingBatch.id}/status`, { status: 'breeding' }, token, companyId);
  await patch(`/batches/${processingBatch.id}/status`, { status: 'for_sale' }, token, companyId);

  const client = await post(
    '/clients',
    { name: `${E2E_MARKER} Comprador`, phone: '04121234567' },
    token,
    companyId,
  );

  // Categories and units come seeded by `CompaniesService.create`; the products
  // do not, and half the screens (compras, consumos, planificar un lote) have
  // nothing to offer without them.
  const [categories, units] = await Promise.all([
    get('/product-categories', token, companyId),
    get('/measurement-units', token, companyId),
  ]);

  const chickProduct = await post(
    '/products',
    {
      name: `${E2E_MARKER} Pollitos`,
      categoryId: categoryId(categories, 'chicks'),
      unitId: units[0].id,
      productType: 'consumable',
      currentStock: 0,
      minStock: 0,
    },
    token,
    companyId,
  );

  const feedProduct = await post(
    '/products',
    {
      name: `${E2E_MARKER} Alimento Engorde`,
      categoryId: categoryId(categories, 'feed'),
      unitId: units[0].id,
      productType: 'consumable',
      currentStock: 0,
      minStock: 0,
    },
    token,
    companyId,
  );

  // Alimento ya en el galpón, para que consumir no dependa de que otro spec
  // haya comprado antes. Recibida, que es lo que mueve el inventario.
  const feedEntry = await post(
    '/entries',
    {
      productId: feedProduct.id,
      quantity: 30,
      totalCost: 12000,
      entryDate: isoDaysAgo(5),
      supplierName: `${E2E_MARKER} Distribuidora`,
    },
    token,
    companyId,
  );
  await patch(`/entries/${feedEntry.id}/receive`, {}, token, companyId);

  // Producto propio del spec de compras. Cada spec compra el suyo: si dos
  // compraran el mismo, sus filas se confunden en la misma tabla y el test se
  // rompe por dónde quedó cada una, no por lo que probaba.
  const purchaseProduct = await post(
    '/products',
    {
      name: `${E2E_MARKER} Vitaminas`,
      categoryId: categoryId(categories, 'supplement'),
      unitId: units[0].id,
      productType: 'consumable',
      currentStock: 0,
      minStock: 0,
    },
    token,
    companyId,
  );

  const account = await post(
    '/treasury/accounts',
    { name: 'Caja E2E', kind: 'cash', currency: 'VES', isActive: true, identifiers: [] },
    token,
    companyId,
  );

  // Opening balance as a real movement: the balance is derived from the ledger,
  // and writing it behind the ledger's back is exactly what the reconciliation
  // screen exists to catch.
  await post(
    '/treasury/movements',
    // `concept` rather than `notes`: that is the column the movements table
    // shows, so this is what a test can actually see on screen.
    { accountId: account.id, direction: 'in', amount: 500000, concept: 'Saldo inicial E2E' },
    token,
    companyId,
  );

  const fixture: E2EFixture = {
    companyId,
    companyName,
    email,
    accessToken: token,
    warehouseId: warehouse.id,
    batchId: batch.id,
    batchCode: batch.code ?? '',
    processedBatchId: processedBatch.id,
    processedBatchCode: processedBatch.code ?? '',
    processingBatchId: processingBatch.id,
    clientId: client.id,
    clientName: client.name,
    chickProductId: chickProduct.id,
    chickProductName: chickProduct.name,
    feedProductId: feedProduct.id,
    feedProductName: feedProduct.name,
    purchaseProductId: purchaseProduct.id,
    purchaseProductName: purchaseProduct.name,
    accountId: account.id,
    accountName: account.name,
  };

  writeStorageState(fixture, auth.refreshToken as string);
  writeFileSync(join(HERE, '.auth', 'fixture.json'), JSON.stringify(fixture, null, 2));

  console.log(`\n  Empresa de prueba: ${companyName} (${companyId})`);
  console.log(`  Lote: ${fixture.batchCode} · Cliente: ${fixture.clientName}\n`);
}

/**
 * Writes the signed-in state Playwright restores into every test.
 *
 * The app keeps its session in localStorage under three keys — access token,
 * refresh token and the active company — so those three are what has to be
 * there. Skipping the login form on every test is not just faster: a broken
 * login would otherwise fail every test in the suite with the same message.
 */
function writeStorageState(fixture: E2EFixture, refreshToken: string) {
  mkdirSync(join(HERE, '.auth'), { recursive: true });

  writeFileSync(
    STATE_PATH,
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin: WEB_URL,
            localStorage: [
              { name: 'cryotech_access_token', value: fixture.accessToken },
              { name: 'cryotech_refresh_token', value: refreshToken },
              { name: 'cryotech_company_id', value: fixture.companyId },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
}

async function post(path: string, body: unknown, token?: string, companyId?: string) {
  return request('POST', path, body, token, companyId);
}

async function get(path: string, token: string, companyId: string) {
  return request('GET', path, undefined, token, companyId);
}

/** The seeded category with a given slug, so the test never hardcodes an id. */
function categoryId(categories: Array<{ id: string; slug: string }>, slug: string): string {
  const match = categories.find((category) => category.slug === slug);
  if (!match) throw new Error(`La empresa nueva no trae la categoría "${slug}"`);
  return match.id;
}

async function patch(path: string, body: unknown, token?: string, companyId?: string) {
  return request('PATCH', path, body, token, companyId);
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  companyId?: string,
) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(companyId ? { 'X-Company-Id': companyId } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `${method} ${path} respondió ${response.status}: ${detail.slice(0, 300)}\n` +
        `¿Está corriendo la API en ${API_URL}? (make api)`,
    );
  }

  return response.json();
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export default globalSetup;
