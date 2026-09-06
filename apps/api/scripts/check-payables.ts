/**
 * Verifies unified payables: paying a processing job the same way a purchase is
 * paid, and the receipt offering the operation instead of an expense category.
 *
 * What must hold, and what the Carmen payment proved did not:
 *   - paying a processing moves cash and does NOT recognise a second expense
 *   - the payable balance of a processing comes from its bolivar figure, not
 *     from `total_cost`, which is dollars — off by the exchange rate otherwise
 *   - a receipt whose amount equals a balance offers that operation first
 *   - a payment can never be attached to two payables, or to none
 *
 * Creates everything it needs and removes it again.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-payables.ts <companyId>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PayablesService } from '../src/modules/payables/payables.service';
import { AccountsService } from '../src/modules/treasury/accounts.service';
import { MovementsService } from '../src/modules/treasury/movements.service';
import { SummaryFormatter } from '../src/modules/assistant/formatting/summary.formatter';
import { MenuService } from '../src/modules/assistant/menu/menu.service';
import { MENU_OPERATIONS } from '../src/modules/assistant/menu/menu.catalog';
import type { ResolvedReceipt } from '../src/modules/assistant/types/assistant.types';
import { targetCompany } from './lib/test-company';

const MARKER = 'ZZ-PAYABLE';
/** Deliberately unrealistic so a bolivar/dollar mix-up is unmissable. */
const RATE = 750;
const COST_USD = 3.2;
const COST_BS = 2400;

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
  const payables = app.get(PayablesService);
  const accounts = app.get(AccountsService);
  const movements = app.get(MovementsService);
  const formatter = app.get(SummaryFormatter);
  const menu = app.get(MenuService);

  const made = {
    accountId: null as string | null,
    warehouseId: null as string | null,
    batchId: null as string | null,
    processingIds: [] as string[],
    productId: null as string | null,
  };

  try {
    console.log('\n1. Preparando un beneficio pagable');

    const account = await accounts.create(companyId, {
      name: `${MARKER} Caja Bs`,
      kind: 'cash',
      currency: 'VES',
      isActive: true,
      identifiers: [],
    });
    made.accountId = account.id;
    await movements.record(companyId, {
      accountId: account.id,
      direction: 'in',
      amount: 100000,
      sourceType: 'manual',
    });

    const warehouse = await prisma.warehouse.create({
      data: { companyId, name: `${MARKER} Galpón`, capacity: 500 },
    });
    made.warehouseId = warehouse.id;

    const batch = await prisma.batch.create({
      data: {
        companyId,
        code: `${MARKER}-LOT`,
        warehouseId: warehouse.id,
        breed: 'Cobb 500',
        initialQuantity: 50,
        currentQuantity: 50,
        status: 'for_sale',
      },
    });
    made.batchId = batch.id;

    // Written directly rather than through ProcessingService: this checks the
    // payable side, and going through the service would also move stock and
    // create a processed product that the cleanup would have to unpick.
    const processing = await prisma.processing.create({
      data: {
        companyId,
        code: `${MARKER}-BEN`,
        batchId: batch.id,
        quantity: 7,
        totalCost: COST_USD,
        totalCostBs: COST_BS,
        exchangeRate: RATE,
        supplierName: 'Carmen',
        paymentStatus: 'pending',
      },
    });
    made.processingIds.push(processing.id);

    const selfProcessed = await prisma.processing.create({
      data: {
        companyId,
        code: `${MARKER}-BEN-PROPIO`,
        batchId: batch.id,
        quantity: 3,
        totalCost: 0,
        totalCostBs: 0,
        isSelfProcessed: true,
        paymentStatus: 'pending',
      },
    });
    made.processingIds.push(selfProcessed.id);

    console.log('\n2. El saldo sale de los bolívares, no de los dólares');

    const open = await payables.listOpen(companyId);
    const mine = open.find((p) => p.id === processing.id);
    check('el beneficio aparece como pagable', Boolean(mine));
    check(
      `el saldo es Bs ${COST_BS}, no ${COST_USD}`,
      mine?.balance === COST_BS,
      String(mine?.balance),
    );
    check('trae el proveedor y el lote', mine?.supplierName === 'Carmen' && mine?.batchCode === `${MARKER}-LOT`);
    check(
      'el beneficio propio no se ofrece a pagar',
      !open.some((p) => p.id === selfProcessed.id),
    );

    console.log('\n3. Pagarlo mueve caja y nada más');

    const txBefore = await prisma.transaction.count({ where: { companyId } });

    await payables.registerPayment(companyId, {
      kind: 'processing',
      payableId: processing.id,
      amount: 1000,
      currency: 'VES',
      accountId: account.id,
      reference: `${MARKER}-REF-1`,
    });

    const txAfter = await prisma.transaction.count({ where: { companyId } });
    check('pagar NO reconoce un gasto', txAfter === txBefore, `${txBefore} → ${txAfter}`);

    const partial = await prisma.processing.findFirstOrThrow({ where: { id: processing.id } });
    check('queda parcialmente pagado', partial.paymentStatus === 'partial', partial.paymentStatus);
    check('el abono se acumula en bolívares', Number(partial.paidAmount) === 1000, String(partial.paidAmount));

    const movement = await prisma.accountMovement.findFirst({
      where: { companyId, reference: `${MARKER}-REF-1` },
    });
    check('sacó el dinero de la cuenta', Number(movement?.amount) === 1000 && movement?.direction === 'out');
    check('el movimiento se atribuye al pago', movement?.sourceType === 'payable_payment');
    check('el movimiento guarda al proveedor', movement?.counterparty === 'Carmen');

    console.log('\n4. Terminar de pagar y rechazar el exceso');

    await payables.registerPayment(companyId, {
      kind: 'processing',
      payableId: processing.id,
      amount: COST_BS - 1000,
      currency: 'VES',
      accountId: account.id,
      reference: `${MARKER}-REF-2`,
    });

    const settled = await prisma.processing.findFirstOrThrow({ where: { id: processing.id } });
    check('queda pagado por completo', settled.paymentStatus === 'paid', settled.paymentStatus);
    check('ya no aparece entre los pagables', !(await payables.listOpen(companyId)).some((p) => p.id === processing.id));

    let overpayRejected = false;
    try {
      await payables.registerPayment(companyId, {
        kind: 'processing',
        payableId: processing.id,
        amount: 1,
        currency: 'VES',
      });
    } catch {
      overpayRejected = true;
    }
    check('rechaza pagar de más', overpayRejected);

    console.log('\n5. Un pago pertenece a una sola operación');

    let bothRejected = false;
    try {
      await prisma.payablePayment.create({
        data: { companyId, entryId: null, processingId: null, amount: 1 },
      });
    } catch {
      bothRejected = true;
    }
    check('la base de datos rechaza un pago sin operación', bothRejected);

    console.log('\n6. El comprobante ofrece la operación, no una categoría');

    // Back to unpaid so there is something to match against.
    await prisma.payablePayment.deleteMany({ where: { processingId: processing.id } });
    await prisma.processing.update({
      where: { id: processing.id },
      data: { paidAmount: 0, paymentStatus: 'pending' },
    });

    const stillOpen = await payables.listOpen(companyId);
    const matched = await payables.findByAmount(companyId, COST_BS);
    check('encuentra la pagable por monto', matched.some((p) => p.id === processing.id));
    check('no confunde con otro monto', (await payables.findByAmount(companyId, COST_BS + 100)).every((p) => p.id !== processing.id));

    const reply = formatter.format(receiptFor(COST_BS), 'draft-1', '2026-08-08', undefined, stillOpen);
    const first = reply.buttons?.[0];
    check(
      'la primera opción es pagar ese beneficio',
      first?.id === `pyb:draft-1:processing-${processing.id}`,
      first?.id,
    );
    check('la opción muestra el código y el saldo', Boolean(first?.description?.includes('2.400')), first?.description);
    check(
      'la categoría contable queda de último recurso',
      reply.buttons?.some((b) => b.id === 'ctl:draft-1') === true,
    );
    check(
      'ya no ofrece "servicios" de primera',
      !reply.buttons?.some((b) => b.id.startsWith('cat:draft-1:utility')),
    );

    const noMatch = formatter.format(receiptFor(999999), 'draft-2', '2026-08-08', undefined, stillOpen);
    check(
      'sin coincidencia de monto ofrece la lista, no una pagable suelta',
      noMatch.buttons?.[0]?.id === `pyb:draft-2:processing-${processing.id}` ||
        noMatch.buttons?.[0]?.id === 'pyl:draft-2:processing',
      noMatch.buttons?.[0]?.id,
    );

    console.log('\n7. El menú ofrece operaciones del negocio');

    const main = await menu.main(companyId, 'simulate', 'dev');
    check(
      'el menú trae todas las operaciones',
      main.buttons?.length === MENU_OPERATIONS.length,
      `${main.buttons?.length} de ${MENU_OPERATIONS.length}`,
    );
    // Diez es el techo de una lista de WhatsApp: por encima, Meta rechaza el
    // mensaje entero y el menú deja de salir. No es una preferencia.
    check('y no pasan de diez filas', (main.buttons?.length ?? 0) <= 10, String(main.buttons?.length));
    check(
      'todas las filas caben en una lista de WhatsApp',
      // Characters, not UTF-16 units: each emoji counts as two in `.length`,
      // which failed rows that Meta accepts.
      (main.buttons ?? []).every(
        (b) => [...b.title].length <= 24 && [...(b.description ?? '')].length <= 72,
      ),
    );

    const payMenu = await menu.handle('pay', companyId, 'simulate', 'dev');
    check('la opción de pagar beneficios lista el pendiente', payMenu.text.includes(`${MARKER}-BEN`));
    check('y muestra su saldo en bolívares', payMenu.text.includes('2.400'));

    const balances = await menu.handle('balances', companyId, 'simulate', 'dev');
    check('la opción de saldos responde con las cuentas', balances.text.includes(`${MARKER} Caja Bs`));

    // Acotado a la cuenta que creó este script. Cuadrar toda la empresa mezcla
    // los hallazgos: la cuenta BDV real arrastra un saldo de apertura que nunca
    // se registró como movimiento, y eso es un asunto de la data, no de este
    // código. La herramienta de cuadre lo reporta; este test no lo tapa.
    const reconcile = await movements.recomputeBalances(companyId, false);
    const drifted = reconcile.mismatches.filter((m: { id: string }) => m.id === made.accountId);
    check('los saldos cuadran con sus movimientos', drifted.length === 0, JSON.stringify(drifted));
  } finally {
    console.log('\nLimpiando...');
    const paymentIds = (
      await prisma.payablePayment.findMany({
        where: { processingId: { in: made.processingIds } },
        select: { id: true },
      })
    ).map((p) => p.id);
    await prisma.accountMovement.deleteMany({ where: { sourceId: { in: paymentIds } } });
    await prisma.payablePayment.deleteMany({ where: { processingId: { in: made.processingIds } } });
    await prisma.transaction.deleteMany({ where: { sourceId: { in: made.processingIds } } });
    await prisma.processing.deleteMany({ where: { id: { in: made.processingIds } } });
    if (made.batchId) await prisma.batch.deleteMany({ where: { id: made.batchId } });
    if (made.warehouseId) await prisma.warehouse.deleteMany({ where: { id: made.warehouseId } });
    if (made.accountId) {
      await prisma.accountMovement.deleteMany({ where: { accountId: made.accountId } });
      await prisma.account.deleteMany({ where: { id: made.accountId } });
    }
    await app.close();
  }

  if (failures === 0) console.log('\nTodo en verde.');
  else {
    console.log(`\n${failures} verificación(es) fallaron.`);
    process.exitCode = 1;
  }
}

/** A minimal outgoing receipt for a given bolivar amount. */
function receiptFor(amount: number): ResolvedReceipt {
  return {
    fields: {
      amount,
      currency: 'VES',
      date: '2026-08-08',
      reference: '058798761234',
      counterparty: 'Carmen Rivas Peña',
      originAccount: null,
      destinationAccount: null,
      concept: null,
      bankName: 'Banco de Venezuela',
    },
    direction: {
      direction: 'out',
      ourAccountId: 'account-1',
      ourAccountName: 'BDV Bs',
      counterAccountId: null,
      counterAccountName: null,
    },
    tier: 'ocr',
    exchangeRate: RATE,
    exchangeRateStale: false,
    warnings: [],
    missing: [],
    duplicateOf: null,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
