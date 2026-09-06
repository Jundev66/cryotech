/**
 * Builds a demo farm through the API.
 *
 * Shared by the README screenshots and by the public demo, which need the same
 * data for different reasons: one photographs it, the other lets a stranger
 * click around it. Everything goes through HTTP rather than SQL because
 * creating a company is not one INSERT — `CompaniesService.create` also seeds
 * the roles, measurement units and product categories, and a company without
 * those breaks half the screens in ways that look like UI bugs.
 *
 * Never point this at the real books: it writes sales, payments and daily logs.
 */

export const DEMO_RATE = 250;

/** Kilos per bird per week, from a broiler's intake curve. */
const WEEKLY_FEED_KG = [0.15, 0.35, 0.6, 0.85, 1.05, 1.2];

const round2 = (n) => Math.round(n * 100) / 100;
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const feedForWeek = (week, birds) => round2((WEEKLY_FEED_KG[week - 1] ?? 1.2) * birds);

/**
 * A tiny API client that carries the session and the active company.
 *
 * `token` and `companyId` are mutable on purpose: the caller registers or logs
 * in, then creates a company, and every later call needs both headers.
 */
export function createClient(baseUrl) {
  const state = { token: '', companyId: '' };

  async function call(method, path, body) {
    const headers = { 'content-type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (state.companyId) headers['X-Company-Id'] = state.companyId;

    const response = await fetch(`${baseUrl}${path}`, {
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

  return {
    state,
    call,
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    patch: (path, body) => call('PATCH', path, body),
    put: (path, body) => call('PUT', path, body),
    del: (path) => call('DELETE', path),
  };
}

/**
 * Creates the company and fills it with a farm mid-cycle.
 *
 * Expects `client.state.token` to hold a session. Sets `client.state.companyId`
 * and returns the ids a caller might need afterwards.
 */
export async function seedDemoFarm(client, { companyName = 'Granja Demo', rate = DEMO_RATE } = {}) {
  const company = await client.post('/companies', { name: companyName });
  client.state.companyId = company.id;

  // Without a rate there is no conversion, and half the screens show bolivares.
  await client.put('/exchange-rates/config', {
    rateSource: 'custom',
    customRate: rate,
    autoFetch: false,
  });

  const warehouse = await client.post('/warehouses', { name: 'Galpón 1', capacity: 600 });
  const [categories, units] = await Promise.all([
    client.get('/product-categories'),
    client.get('/measurement-units'),
  ]);
  const categoryId = (slug) => categories.find((c) => c.slug === slug)?.id ?? categories[0].id;
  const kg = units.find((u) => u.abbreviation === 'kg')?.id ?? units[0].id;

  const feed = await client.post('/products', {
    name: 'Alimento Engorde',
    categoryId: categoryId('feed'),
    unitId: kg,
    productType: 'consumable',
    currentStock: 0,
    minStock: 50,
  });

  const account = await client.post('/treasury/accounts', {
    name: 'BDV Bs',
    kind: 'bank',
    currency: 'VES',
    isActive: true,
    identifiers: [],
  });
  const cash = await client.post('/treasury/accounts', {
    name: 'Caja Bs',
    kind: 'cash',
    currency: 'VES',
    isActive: true,
    identifiers: [],
  });

  const clients = [];
  for (const name of ['Panadería La Espiga', 'Restaurante El Fogón', 'Carnicería Central']) {
    clients.push(await client.post('/clients', { name }));
  }

  // Two batches: one mature with history, one just started.
  const batches = [];
  for (const spec of [
    { breed: 'Cobb 500', quantity: 300, age: 38, status: 'for_sale' },
    { breed: 'Ross 308', quantity: 250, age: 12, status: 'breeding' },
  ]) {
    const batch = await client.post('/batches', {
      warehouseId: warehouse.id,
      breed: spec.breed,
      startDate: daysAgo(spec.age),
      initialQuantity: spec.quantity,
      purchasePricePerUnit: 45,
    });
    await client.patch(`/batches/${batch.id}/status`, { status: 'breeding' });
    if (spec.status === 'for_sale') {
      await client.patch(`/batches/${batch.id}/status`, { status: 'for_sale' });
    }
    batches.push({ ...batch, ...spec });
  }

  // Feed purchase, received: without receiving it there is no stock and no expense.
  const entry = await client.post('/entries', {
    productId: feed.id,
    quantity: 1500,
    totalCost: 600_000,
    entryDate: daysAgo(40),
    supplierName: 'Distribuidora Agropecuaria',
  });
  await client.patch(`/entries/${entry.id}/receive`, {});

  // Daily logs: rising weight and a small, uneven mortality.
  for (const batch of batches) {
    for (let day = 7; day <= batch.age; day += 7) {
      const weight = Math.round(40 + day * day * 0.85 + day * 12);
      await client.post('/daily-logs', {
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

  // Approved feed consumptions: the FCR chart reads `feed_consumptions`, not the
  // kilos on the daily log.
  for (let day = 7; day <= mature.age; day += 7) {
    const consumption = await client.post('/feed/consumptions', {
      batchId: mature.id,
      productId: feed.id,
      consumptionDate: daysAgo(mature.age - day),
      quantityKg: feedForWeek(day / 7, mature.quantity),
    });
    await client.patch(`/feed/consumptions/${consumption.id}/approve`, {});
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
    const created = await client.post('/sales', {
      batchId: mature.id,
      clientId: sale.client.id,
      saleType: 'live',
      quantity: sale.quantity,
      weightKg: sale.kilos,
      pricePerKg: 4,
      totalAmount: total,
      exchangeRate: rate,
      saleDate: daysAgo(sale.days),
    });

    if (sale.paid === 'none') continue;
    const amount = sale.paid === 'full' ? total : round2(total / 2);
    await client.post(`/sales/${created.id}/payments`, {
      amount,
      amountBs: round2(amount * rate),
      exchangeRate: rate,
      paymentDate: daysAgo(Math.max(sale.days - 1, 0)),
      accountId: account.id,
      reference: `05871234${sale.quantity}`,
    });
  }

  // Cash movements, so treasury shows two accounts with activity.
  await client.post('/treasury/movements', {
    accountId: cash.id,
    direction: 'out',
    amount: 18_500,
    movementDate: daysAgo(6),
    concept: 'Flete del alimento',
  });
  await client.post('/treasury/movements', {
    accountId: cash.id,
    direction: 'in',
    amount: 60_000,
    movementDate: daysAgo(20),
    concept: 'Aporte del propietario',
  });

  return { companyId: company.id, matureBatchId: mature.id, feedProductId: feed.id };
}
