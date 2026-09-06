/**
 * Dos empresas, y una intentando robarle a la otra.
 *
 * El aislamiento de este sistema vive en la aplicación —no hay RLS, la API
 * habla con Postgres por un solo rol— así que lo único que separa una granja de
 * otra es que cada consulta filtre por `companyId` y que cada id que llegue del
 * cliente se compruebe antes de escribirlo. Lo primero se cumplía; lo segundo
 * no: diez métodos escribían una clave foránea del cuerpo sin mirar de quién
 * era, así que una compra podía imputarse al lote de otra granja y un producto
 * colgarse de su categoría —devolviendo su nombre en la respuesta—.
 *
 * Esto lo intenta de verdad. Por HTTP y no por los servicios, porque es el
 * único nivel donde también se prueban los guards y la cabecera `X-Company-Id`:
 * un servicio llamado a mano nunca pasa por ellos.
 *
 * Y al final compara la empresa víctima consigo misma. Un intento rechazado con
 * un 404 pero que ya escribió algo no está rechazado.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-tenancy.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

const API_URL = process.env.CHECK_API_URL ?? 'http://localhost:3011/api';
const MARKER = 'ZZ Aislamiento';
// Generated per run rather than written here: this script registers two real
// users, and a constant password in a public repository is a live account
// waiting for whoever reads it.
const PASSWORD = `Zz${randomBytes(8).toString('hex')}.`;

const prisma = new PrismaClient();

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

interface Farm {
  token: string;
  companyId: string;
  userId: string;
  warehouseId: string;
  batchId: string;
  /** En planificación: es el único estado que acepta insumos. */
  plannedBatchId: string;
  clientId: string;
  productId: string;
  categoryId: string;
  unitId: string;
  accountId: string;
  saleId: string;
  dailyLogId: string;
}

async function main() {
  console.log('\nPreparando dos empresas');

  // Sufijo por reloj: si una corrida anterior murió a medias, sus restos no
  // deben chocar con esta ni, peor, ser reutilizados como si fueran nuevos.
  const stamp = Date.now();
  const victim = await buildFarm(`${MARKER} A ${stamp}`, `zz-aisla-a-${stamp}@cryotech.test`);
  const attacker = await buildFarm(`${MARKER} B ${stamp}`, `zz-aisla-b-${stamp}@cryotech.test`);
  console.log(`  víctima  ${victim.companyId}`);
  console.log(`  atacante ${attacker.companyId}`);

  const before = await snapshot(victim.companyId);

  try {
    console.log('\n1. La cabecera de otra empresa');

    const stolenHeader = await call('GET', '/batches', undefined, attacker.token, victim.companyId);
    check('no deja usar el X-Company-Id ajeno', stolenHeader.status === 403, `HTTP ${stolenHeader.status}`);

    const noHeader = await call('GET', '/batches', undefined, attacker.token);
    check('exige la cabecera', noHeader.status === 400, `HTTP ${noHeader.status}`);

    const readCompany = await call('GET', `/companies/${victim.companyId}`, undefined, attacker.token);
    check(
      'no deja leer la empresa ajena',
      readCompany.status === 404,
      `HTTP ${readCompany.status} ${JSON.stringify(readCompany.body).slice(0, 80)}`,
    );

    console.log('\n2. Ids ajenos en el cuerpo, con la cabecera propia');

    // Este es el ataque de verdad: la petición es legítima —token propio,
    // empresa propia, permisos propios— y lo único ajeno es el UUID de dentro.
    const attempts: Array<[string, () => Promise<Attempt>]> = [
      [
        'compra imputada al lote ajeno',
        () =>
          call('POST', '/entries', {
            productId: attacker.productId,
            batchId: victim.batchId,
            quantity: 1,
            entryDate: today(),
          }, attacker.token, attacker.companyId),
      ],
      [
        'gasto imputado al lote ajeno',
        () =>
          call('POST', '/transactions', {
            type: 'expense',
            category: 'other',
            amount: 10,
            batchId: victim.batchId,
            transactionDate: today(),
          }, attacker.token, attacker.companyId),
      ],
      [
        'producto colgado de la categoría ajena',
        () =>
          call('POST', '/products', {
            name: 'Robado',
            categoryId: victim.categoryId,
            unitId: attacker.unitId,
            currentStock: 0,
            minStock: 0,
          }, attacker.token, attacker.companyId),
      ],
      [
        'producto colgado de la unidad ajena',
        () =>
          call('POST', '/products', {
            name: 'Robado 2',
            categoryId: attacker.categoryId,
            unitId: victim.unitId,
            currentStock: 0,
            minStock: 0,
          }, attacker.token, attacker.companyId),
      ],
      [
        'venta reasignada al cliente ajeno',
        () =>
          call('PATCH', `/sales/${attacker.saleId}`, {
            clientId: victim.clientId,
          }, attacker.token, attacker.companyId),
      ],
      [
        'cobro contra la cuenta ajena',
        () =>
          call('POST', `/sales/${attacker.saleId}/payments`, {
            amount: 1,
            accountId: victim.accountId,
            paymentDate: today(),
          }, attacker.token, attacker.companyId),
      ],
      [
        'registro diario apuntando al alimento ajeno',
        () =>
          call('PATCH', `/daily-logs/${attacker.dailyLogId}`, {
            feedConsumedKg: 1,
            feedProductId: victim.productId,
          }, attacker.token, attacker.companyId),
      ],
      [
        'insumo del lote apuntando al producto ajeno',
        () =>
          call('POST', `/batches/${attacker.plannedBatchId}/entry-lines`, {
            productId: victim.productId,
            quantity: 1,
          }, attacker.token, attacker.companyId),
      ],
      [
        'consumo de alimento con el producto ajeno',
        () =>
          call('POST', '/feed/consumptions', {
            batchId: attacker.batchId,
            productId: victim.productId,
            consumptionDate: today(),
            quantityKg: 1,
          }, attacker.token, attacker.companyId),
      ],
      [
        'beneficio contra el producto ajeno',
        () =>
          call('POST', '/processing', {
            batchId: attacker.batchId,
            productId: victim.productId,
            quantity: 1,
            totalCost: 1,
          }, attacker.token, attacker.companyId),
      ],
    ];

    for (const [label, attempt] of attempts) {
      const result = await attempt();

      // 404 exacto, no "cualquier 4xx".
      //
      // Esta comprobación empezó aceptando cualquier error del cliente y pasaba
      // en verde con las validaciones quitadas a propósito: a dos de las cargas
      // les faltaba un campo obligatorio, así que Zod las rechazaba con un 400
      // antes de que el aislamiento entrara siquiera en juego. Una prueba que
      // pasa por el motivo equivocado es peor que no tenerla — dice que estás
      // cubierto justo donde no lo estás.
      //
      // El 404 es el que significa "ese id no es tuyo". Un 400 aquí es un fallo
      // de esta prueba, no del sistema, y así se reporta.
      check(
        label,
        result.status === 404,
        result.status === 400
          ? `HTTP 400 — la carga es inválida por otra razón, arregla la prueba: ${JSON.stringify(result.body).slice(0, 120)}`
          : `HTTP ${result.status} — pasó`,
      );

      // Y que el rechazo no traiga de regalo el nombre de lo ajeno. Un 404 que
      // dice "Producto no encontrado" está bien; uno que dice cómo se llama el
      // producto de la otra granja ya filtró lo que se quería proteger.
      const leaked = JSON.stringify(result.body ?? {});
      check(
        `  └ y sin revelar nada`,
        !leaked.includes(victim.leakBait),
        `la respuesta menciona "${victim.leakBait}"`,
      );
    }

    console.log('\n3. La víctima no se enteró');

    const after = await snapshot(victim.companyId);
    for (const [key, value] of Object.entries(before)) {
      check(`${key} sigue en ${value}`, after[key] === value, `ahora ${after[key]}`);
    }
  } finally {
    console.log('\nLimpiando...');
    // El atacante primero. Cuando esta prueba falla es justamente porque sus
    // filas quedaron apuntando a las de la víctima, y entonces borrar la
    // víctima antes choca contra la clave foránea y deja las dos empresas a
    // medio borrar — basura que hereda la siguiente corrida.
    for (const farm of [attacker, victim]) {
      await prisma.company.deleteMany({ where: { id: farm.companyId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [attacker.userId, victim.userId] } },
    });
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? '\nTodo en verde.\n' : `\n${failures} verificación(es) fallaron.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

/** El nombre inconfundible que la víctima le pone a sus cosas, para detectar
 *  si alguna respuesta al atacante lo devuelve. */
type FarmWithBait = Farm & { leakBait: string };

async function buildFarm(companyName: string, email: string): Promise<FarmWithBait> {
  const leakBait = `Cebo-${email.split('@')[0]}`;

  const auth = await expectOk<{ accessToken: string; user: { id: string } }>(
    call('POST', '/auth/register', {
      email,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      fullName: 'Aislamiento',
    }),
  );
  const token = auth.accessToken;

  const company = await expectOk<{ id: string }>(call('POST', '/companies', { name: companyName }, token));
  const companyId = company.id;
  // Every POST below is read for its id; the two GETs say what they return.
  const scoped = <T = { id: string }>(method: string, path: string, body?: unknown) =>
    expectOk<T>(call(method, path, body, token, companyId));

  const warehouse = await scoped('POST', '/warehouses', { name: `${leakBait} Galpón`, capacity: 100 });

  const batch = await scoped('POST', '/batches', {
    warehouseId: warehouse.id,
    breed: 'Cobb 500',
    startDate: daysAgo(30),
    initialQuantity: 100,
  });
  await scoped('PATCH', `/batches/${batch.id}/status`, { status: 'breeding' });
  await scoped('PATCH', `/batches/${batch.id}/status`, { status: 'for_sale' });

  // En planificación y aparte: `addEntryLine` solo acepta lotes en ese estado,
  // y el de arriba ya está en venta porque hace falta así para vender y beneficiar.
  const plannedBatch = await scoped('POST', '/batches', {
    warehouseId: warehouse.id,
    breed: 'Ross 308',
    startDate: daysAgo(1),
    initialQuantity: 50,
  });

  const client = await scoped('POST', '/clients', { name: `${leakBait} Cliente` });

  const categories = await scoped<Array<{ id: string; slug: string }>>('GET', '/product-categories');
  const units = await scoped<Array<{ id: string }>>('GET', '/measurement-units');
  const categoryId = categories[0].id;
  const unitId = units[0].id;

  const product = await scoped('POST', '/products', {
    name: `${leakBait} Producto`,
    categoryId,
    unitId,
    currentStock: 100,
    minStock: 0,
  });

  const account = await scoped('POST', '/treasury/accounts', {
    name: `${leakBait} Cuenta`,
    kind: 'cash',
    currency: 'VES',
  });

  const sale = await scoped('POST', '/sales', {
    batchId: batch.id,
    clientId: client.id,
    saleType: 'live',
    quantity: 2,
    weightKg: 5,
    pricePerKg: 4,
    totalAmount: 20,
  });

  const dailyLog = await scoped('POST', '/daily-logs', {
    batchId: batch.id,
    logDate: today(),
    mortality: 0,
  });

  return {
    token,
    companyId,
    userId: auth.user.id,
    warehouseId: warehouse.id,
    batchId: batch.id,
    plannedBatchId: plannedBatch.id,
    clientId: client.id,
    productId: product.id,
    categoryId,
    unitId,
    accountId: account.id,
    saleId: sale.id,
    dailyLogId: dailyLog.id,
    leakBait,
  };
}

/** Lo que tiene que seguir igual después del ataque. */
async function snapshot(companyId: string): Promise<Record<string, string>> {
  const [entries, transactions, products, batchLines, consumptions, processings, sale, batch, log] =
    await Promise.all([
      prisma.productEntry.count({ where: { companyId } }),
      prisma.transaction.count({ where: { companyId } }),
      prisma.product.count({ where: { companyId } }),
      prisma.batchEntryLine.count({ where: { batch: { companyId } } }),
      prisma.feedConsumption.count({ where: { companyId } }),
      prisma.processing.count({ where: { companyId } }),
      prisma.sale.count({ where: { companyId } }),
      prisma.batch.aggregate({ where: { companyId }, _sum: { currentQuantity: true } }),
      prisma.dailyLog.count({ where: { companyId } }),
    ]);

  return {
    compras: String(entries),
    movimientos: String(transactions),
    productos: String(products),
    'insumos de lote': String(batchLines),
    consumos: String(consumptions),
    beneficios: String(processings),
    ventas: String(sale),
    'aves vivas': String(batch._sum.currentQuantity ?? 0),
    'registros diarios': String(log),
  };
}

interface Attempt {
  status: number;
  body: unknown;
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  companyId?: string,
): Promise<Attempt> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(companyId ? { 'X-Company-Id': companyId } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* la respuesta no era JSON; se queda el texto */
  }
  return { status: response.status, body: parsed };
}

/** Para el montaje, donde un fallo es un error del script y no un hallazgo. */
async function expectOk<T = { id: string }>(pending: Promise<Attempt>): Promise<T> {
  const result = await pending;
  if (result.status >= 400) {
    throw new Error(`Montaje: HTTP ${result.status} — ${JSON.stringify(result.body).slice(0, 200)}`);
  }
  return result.body as T;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
