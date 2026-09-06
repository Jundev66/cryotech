/**
 * Verifies the purchase lifecycle: plan a batch, pay for the chicks in advance,
 * then confirm the batch.
 *
 * The two things that must hold and could not before:
 *   - paying moves cash and does NOT recognise a second expense
 *   - confirming a batch reuses the purchase that was already registered,
 *     instead of creating a duplicate that would double stock and expense
 *
 * Creates everything it needs and removes it again. Never touches pre-existing
 * batches, entries, products or movements.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-purchases.ts <companyId>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntriesService } from '../src/modules/entries/entries.service';
import { BatchesService } from '../src/modules/batches/batches.service';
import { AccountsService } from '../src/modules/treasury/accounts.service';
import { MovementsService } from '../src/modules/treasury/movements.service';
import { targetCompany } from './lib/test-company';

const MARKER = 'ZZ-PURCHASE';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  // Por defecto la empresa de pruebas. Un companyId por argumento sigue
  // sirviendo para reproducir algo contra datos reales.
  const companyId = await targetCompany(app, process.argv[2]);
  const prisma = app.get(PrismaService);
  const entries = app.get(EntriesService);
  const batches = app.get(BatchesService);
  const accounts = app.get(AccountsService);

  const made = {
    accountId: null as string | null,
    categoryId: null as string | null,
    productId: null as string | null,
    warehouseId: null as string | null,
    batchId: null as string | null,
    entryIds: [] as string[],
  };

  try {
    console.log('\n1. Preparando lote planificado con pollos bebé');

    const account = await accounts.create(companyId, {
      name: `${MARKER} Caja Bs`,
      kind: 'cash',
      currency: 'VES',
      isActive: true,
      identifiers: [],
    });
    made.accountId = account.id;
    // Seed the opening balance as a real movement, not a direct write: the
    // balance is derived from the ledger, and setting it behind the ledger's
    // back is exactly what the reconciliation check exists to catch.
    await app
      .get(MovementsService)
      .record(companyId, { accountId: account.id, direction: 'in', amount: 100000, sourceType: 'manual' });

    const unit = await prisma.measurementUnit.findFirstOrThrow({ where: { companyId } });
    const category = await prisma.productCategoryConfig.create({
      data: { companyId, name: `${MARKER} Pollos`, slug: `${MARKER.toLowerCase()}-chicks` },
    });
    made.categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        companyId,
        name: `${MARKER} Pollos Bebé`,
        categoryId: category.id,
        unitId: unit.id,
        currentStock: 0,
        minStock: 0,
      },
    });
    made.productId = product.id;

    const warehouse = await prisma.warehouse.create({
      data: { companyId, name: `${MARKER} Galpón`, capacity: 1000 },
    });
    made.warehouseId = warehouse.id;

    const batch = await batches.create(companyId, {
      warehouseId: warehouse.id,
      breed: 'Cobb 500',
      startDate: new Date().toISOString().slice(0, 10),
      initialQuantity: 500,
      entryLines: [{ productId: product.id, quantity: 500, costPerUnit: 20 }],
    });
    made.batchId = batch.id;
    check('el lote nace planificado', batch.status === 'planned', batch.status);

    console.log('\n2. Registrar la compra y pagarla por adelantado');

    const entry = await entries.create(companyId, {
      productId: product.id,
      batchId: batch.id,
      quantity: 500,
      totalCost: 10000,
      entryDate: new Date().toISOString().slice(0, 10),
      supplierName: 'Incubadora XYZ',
    });
    made.entryIds.push(entry.id);
    check('la compra nace pendiente y sin pagar', entry.status === 'pending' && entry.paymentStatus === 'pending');

    const txBeforePay = await prisma.transaction.count({ where: { companyId } });
    const stockBeforePay = Number((await prisma.product.findFirstOrThrow({ where: { id: product.id } })).currentStock);

    await entries.registerPayment(companyId, entry.id, {
      amount: 6000,
      currency: 'VES',
      accountId: account.id,
      reference: `${MARKER}-REF-1`,
    });

    const afterPartial = await entries.findOne(companyId, entry.id);
    check('queda parcialmente pagada', afterPartial.paymentStatus === 'partial', afterPartial.paymentStatus);
    check('el abono se acumula', afterPartial.paidAmount.toString() === '6000', afterPartial.paidAmount.toString());

    const txAfterPay = await prisma.transaction.count({ where: { companyId } });
    check('pagar NO reconoce un gasto', txBeforePay === txAfterPay, `${txBeforePay} -> ${txAfterPay}`);

    const stockAfterPay = Number((await prisma.product.findFirstOrThrow({ where: { id: product.id } })).currentStock);
    check('pagar NO mueve stock', stockBeforePay === stockAfterPay);

    const balanceAfterPay = (await prisma.account.findFirstOrThrow({ where: { id: account.id } })).currentBalance;
    check('pagar SÍ saca dinero de la cuenta', balanceAfterPay.toString() === '94000', balanceAfterPay.toString());

    const movement = await prisma.accountMovement.findFirst({ where: { reference: `${MARKER}-REF-1` } });
    check('el movimiento es una salida', movement?.direction === 'out');
    check('el movimiento guarda al proveedor', movement?.counterparty === 'Incubadora XYZ');

    console.log('\n3. Confirmar el lote');

    const entriesBefore = await prisma.productEntry.count({ where: { batchId: batch.id } });
    await batches.updateStatus(companyId, batch.id, 'breeding');

    const entriesAfter = await prisma.productEntry.findMany({ where: { batchId: batch.id } });
    made.entryIds = entriesAfter.map((e) => e.id);
    check(
      'NO se duplica la entrada ya registrada',
      entriesAfter.length === entriesBefore && entriesAfter.length === 1,
      `${entriesBefore} -> ${entriesAfter.length}`,
    );
    check('la entrada quedó recibida', entriesAfter[0]?.status === 'received', entriesAfter[0]?.status);
    check('la entrada recibida tiene código', Boolean(entriesAfter[0]?.code), String(entriesAfter[0]?.code));

    const stockAfterConfirm = Number((await prisma.product.findFirstOrThrow({ where: { id: product.id } })).currentStock);
    check('el stock sube una sola vez', stockAfterConfirm === 500, String(stockAfterConfirm));

    const expenses = await prisma.transaction.findMany({
      where: { companyId, sourceType: 'entry', sourceId: { in: entriesAfter.map((e) => e.id) } },
    });
    check('se reconoce exactamente un gasto', expenses.length === 1, String(expenses.length));
    check('el gasto es por el total de la compra', expenses[0]?.amount.toString() === '10000', expenses[0]?.amount.toString());

    console.log('\n4. Terminar de pagar');

    await entries.registerPayment(companyId, entriesAfter[0].id, {
      amount: 4000,
      currency: 'VES',
      accountId: account.id,
      reference: `${MARKER}-REF-2`,
    });
    const afterFull = await entries.findOne(companyId, entriesAfter[0].id);
    check('queda pagada por completo', afterFull.paymentStatus === 'paid', afterFull.paymentStatus);

    let overpayRejected = false;
    try {
      await entries.registerPayment(companyId, entriesAfter[0].id, { amount: 1, currency: 'VES' });
    } catch {
      overpayRejected = true;
    }
    check('rechaza pagar de más', overpayRejected);

    // Acotado a la cuenta que creó este script. Cuadrar toda la empresa mezcla
    // los hallazgos: la cuenta BDV real arrastra un saldo de apertura que nunca
    // se registró como movimiento, y eso es un asunto de la data, no de este
    // código. La herramienta de cuadre lo reporta; este test no lo tapa.
    const reconcile = await app.get(MovementsService).recomputeBalances(companyId, false);
    const mine = reconcile.mismatches.filter((m: { id: string }) => m.id === made.accountId);
    check('los saldos cuadran con sus movimientos', mine.length === 0, JSON.stringify(mine));
  } finally {
    console.log('\nLimpiando...');
    const paymentIds = (
      await prisma.payablePayment.findMany({ where: { entryId: { in: made.entryIds } }, select: { id: true } })
    ).map((p) => p.id);
    await prisma.accountMovement.deleteMany({ where: { sourceId: { in: paymentIds } } });
    await prisma.payablePayment.deleteMany({ where: { entryId: { in: made.entryIds } } });
    await prisma.transaction.deleteMany({ where: { sourceId: { in: made.entryIds } } });
    await prisma.productEntry.deleteMany({ where: { id: { in: made.entryIds } } });
    if (made.batchId) await prisma.batchEntryLine.deleteMany({ where: { batchId: made.batchId } });
    if (made.batchId) await prisma.batch.deleteMany({ where: { id: made.batchId } });
    if (made.warehouseId) await prisma.warehouse.deleteMany({ where: { id: made.warehouseId } });
    if (made.productId) await prisma.product.deleteMany({ where: { id: made.productId } });
    if (made.categoryId) await prisma.productCategoryConfig.deleteMany({ where: { id: made.categoryId } });
    if (made.accountId) {
      await prisma.accountMovement.deleteMany({ where: { accountId: made.accountId } });
      await prisma.account.deleteMany({ where: { id: made.accountId } });
    }
    await app.close();
  }

  console.log(failures === 0 ? '\nTodo en verde.\n' : `\n${failures} verificación(es) fallaron.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
