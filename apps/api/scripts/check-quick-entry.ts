/**
 * The operations that need no screenshot: a quick expense, a cash collection,
 * a sale paid on the spot, and the summaries that arrive on their own — plus
 * the guards that keep money from being recorded wrong: undo, concurrent
 * payments, account currency, overdue dates and locked sales.
 *
 * Driven the way the phone drives them — typed sentences and taps — against the
 * test company. Creates everything it needs and removes it again.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-quick-entry.ts [companyId]
 */
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { startOfToday } from '@cryotech/shared-types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { ExchangeRatesService } from '../src/modules/exchange-rates/exchange-rates.service';
import { SalesService } from '../src/modules/sales/sales.service';
import { TransactionsService } from '../src/modules/transactions/transactions.service';
import { ClientsService } from '../src/modules/clients/clients.service';
import { ReportsService } from '../src/modules/reports/reports.service';
import { BUTTON, buildButtonId, type OutgoingMessage } from '../src/modules/assistant/types/assistant.types';
import { targetCompany } from './lib/test-company';

const MARKER = 'ZZ-QE';
const CHANNEL = 'check-quick-entry';
const USER = 'ZZ-QE-USER';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function titles(reply: OutgoingMessage | null): string {
  return reply?.buttons?.map((b) => b.title).join(' | ') ?? 'sin botones';
}

function find(reply: OutgoingMessage | null, match: string) {
  return reply?.buttons?.find((b) => b.title.includes(match));
}

function pick(reply: OutgoingMessage | null, match: string): string {
  const button = find(reply, match);
  if (!button) throw new Error(`No hay opción "${match}" en: ${titles(reply)} — ${reply?.text?.slice(0, 200)}`);
  return button.id;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function rejects(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return (error as Error)?.message ?? 'error';
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const companyId = await targetCompany(app, process.argv[2]);
  const prisma = app.get(PrismaService);
  const assistant = app.get(AssistantService);
  const exchangeRates = app.get(ExchangeRatesService);
  const salesService = app.get(SalesService);
  const transactionsService = app.get(TransactionsService);
  const clientsService = app.get(ClientsService);
  const reports = app.get(ReportsService);

  const tap = (id: string) => assistant.handleButton(id, companyId, CHANNEL, USER);
  const type = (text: string) => assistant.handleText(text, companyId, CHANNEL, USER);
  const balanceOf = async (accountId: string) =>
    Number((await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).currentBalance);

  const made = {
    warehouseId: null as string | null,
    batchId: null as string | null,
    clientIds: [] as string[],
    accountIds: [] as string[],
  };

  try {
    console.log('\n1. Preparando lote, cuentas y un cliente que debe');

    await prisma.botFlowSession.deleteMany({ where: { channel: CHANNEL } });

    const warehouse = await prisma.warehouse.create({ data: { companyId, name: `${MARKER} Galpón` } });
    made.warehouseId = warehouse.id;

    const batch = await prisma.batch.create({
      data: {
        companyId,
        code: `${MARKER}-LOT`,
        warehouseId: warehouse.id,
        breed: 'Cobb 500',
        initialQuantity: 100,
        currentQuantity: 100,
        status: 'for_sale',
      },
    });
    made.batchId = batch.id;

    const usd = await prisma.account.create({
      data: { companyId, name: `${MARKER} Caja dólares`, kind: 'cash', currency: 'USD' },
    });
    const ves = await prisma.account.create({
      data: { companyId, name: `${MARKER} Caja bolívares`, kind: 'cash', currency: 'VES' },
    });
    made.accountIds.push(usd.id, ves.id);

    const debtor = await prisma.client.create({
      data: { companyId, code: `${MARKER}-C1`, name: `${MARKER} Pedro Cobranza` },
    });
    const buyer = await prisma.client.create({
      data: { companyId, code: `${MARKER}-C2`, name: `${MARKER} Zoila Contado` },
    });
    made.clientIds.push(debtor.id, buyer.id);

    // Two open sales, the older one first: that is the order a payment spreads in.
    const older = await prisma.sale.create({
      data: {
        companyId, batchId: batch.id, clientId: debtor.id, code: `${MARKER}-V1`, saleType: 'live',
        quantity: 5, weightKg: 7.5, pricePerKg: 4, totalAmount: 30, paymentStatus: 'pending', paidAmount: 0,
        saleDate: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    const newer = await prisma.sale.create({
      data: {
        companyId, batchId: batch.id, clientId: debtor.id, code: `${MARKER}-V2`, saleType: 'live',
        quantity: 5, weightKg: 10, pricePerKg: 4, totalAmount: 40, paymentStatus: 'pending', paidAmount: 0,
        saleDate: new Date('2026-09-05T00:00:00.000Z'),
      },
    });

    const current = await exchangeRates.getCurrentRate(companyId);
    check('hay tasa para convertir', !current.unavailable && current.effectiveRate > 0, JSON.stringify(current));
    const rate = current.effectiveRate;

    console.log('\n2. Un gasto escrito en una línea');

    let reply: OutgoingMessage | null = await type('gasto 20$ gasoil');
    check('abre el gasto con lo leído ya contestado', reply.text.includes('De dónde salió el dinero'), reply.text);
    check('solo ofrece cuentas en dólares', Boolean(find(reply, 'Caja dólares')) && !find(reply, 'Caja bolívares'), titles(reply));
    check('y ofrece no usar cuenta', Boolean(find(reply, 'Sin cuenta')), titles(reply));

    reply = await tap(pick(reply, 'Caja dólares'));
    check('pregunta el lote', reply?.text.includes('Es de algún lote') === true, reply?.text);
    reply = await tap(pick(reply, `${MARKER}-LOT`));
    check('va directo al resumen', reply?.text.includes('¿Lo registro así?') === true, reply?.text);
    check('el resumen trae la categoría', reply?.text.includes('Transporte') === true, reply?.text);
    check('y la nota leída del mensaje', reply?.text.includes('Gasoil') === true, reply?.text);

    reply = await tap(pick(reply, 'Registrar'));
    check('acusa el gasto', reply?.text.includes('✅ Gasto registrado') === true, reply?.text);
    check('ofrece deshacer', Boolean(find(reply, 'Deshacer')), titles(reply));

    const expense = await prisma.transaction.findFirst({
      where: { companyId, accountId: usd.id, type: 'expense' },
      orderBy: { createdAt: 'desc' },
    });
    check('creó el gasto', Boolean(expense));
    check('en su categoría', expense?.category === 'transport', expense?.category);
    check('cargado al lote', expense?.batchId === batch.id);
    check('en bolívares a la tasa del día', Number(expense?.amount) === round2(20 * rate), `${expense?.amount} vs ${round2(20 * rate)}`);

    const out = await prisma.accountMovement.findFirst({ where: { accountId: usd.id, direction: 'out' } });
    check('sacó los dólares de la caja', Number(out?.amount) === 20, String(out?.amount));

    console.log('\n3. Un gasto sin moneda escrita pregunta la moneda');

    reply = await type('gasto 1.500 luz');
    check('pregunta la moneda', reply.text.includes('En qué moneda'), reply.text);
    reply = await tap(pick(reply, 'Bolívares'));
    check('y luego solo cuentas en bolívares', Boolean(find(reply, 'Caja bolívares')) && !find(reply, 'Caja dólares'), titles(reply));
    await tap(pick(reply, 'Cancelar'));

    console.log('\n4. Un cobro escrito en una línea, repartido en dos ventas');

    reply = await type(`cobré 50$ ${MARKER} Pedro Cobranza`);
    check('reconoce al cliente y pregunta la venta', reply.text.includes('A qué venta lo aplico'), reply.text);
    check('ofrece repartir desde la más vieja', Boolean(find(reply, 'La más vieja primero')), titles(reply));
    check('y lista sus dos ventas', Boolean(find(reply, `${MARKER}-V1`)) && Boolean(find(reply, `${MARKER}-V2`)), titles(reply));

    reply = await tap(pick(reply, 'La más vieja primero'));
    check('pregunta dónde entró', reply?.text.includes('Dónde entró el dinero') === true, reply?.text);
    reply = await tap(pick(reply, 'Caja dólares'));
    check('va al resumen', reply?.text.includes('¿Lo registro así?') === true, reply?.text);
    reply = await tap(pick(reply, 'Registrar'));
    check('acusa el reparto', reply?.text.includes('repartido en 2 ventas') === true, reply?.text);

    const olderAfter = await prisma.sale.findUniqueOrThrow({ where: { id: older.id } });
    const newerAfter = await prisma.sale.findUniqueOrThrow({ where: { id: newer.id } });
    check('la vieja quedó pagada', olderAfter.paymentStatus === 'paid' && Number(olderAfter.paidAmount) === 30,
      `${olderAfter.paymentStatus} ${olderAfter.paidAmount}`);
    check('la nueva recibió el resto', newerAfter.paymentStatus === 'partial' && Number(newerAfter.paidAmount) === 20,
      `${newerAfter.paymentStatus} ${newerAfter.paidAmount}`);
    const movementsIn = await prisma.accountMovement.findMany({ where: { accountId: usd.id, direction: 'in' } });
    check('entraron los 50 dólares a la caja', round2(movementsIn.reduce((s, m) => s + Number(m.amount), 0)) === 50,
      movementsIn.map((m) => String(m.amount)).join('+'));

    console.log('\n5. El botón de un cliente abre el cobro ya sobre él');

    reply = await tap(buildButtonId(BUTTON.FORM, 'collect', debtor.id));
    check('salta la pregunta del cliente', reply?.text.includes('A qué venta lo aplico') === true, reply?.text);
    await tap(pick(reply, 'Cancelar'));

    reply = await tap(buildButtonId(BUTTON.FORM, 'collect', randomUUID()));
    check('un cliente que no debe no se precarga', reply?.text.includes('Quién te pagó') === true, reply?.text);
    await tap(pick(reply, 'Cancelar'));

    console.log('\n6. Una venta pagada en efectivo registra el cobro al momento');

    reply = await type('venta');
    reply = await type('zoila');
    reply = await tap(pick(reply, 'Zoila Contado'));
    reply = await tap(pick(reply, 'Vivo'));
    reply = await tap(pick(reply, `${MARKER}-LOT`));
    reply = await type('3');
    reply = await type('6');
    reply = await type('4');
    reply = await tap(pick(reply, 'Hoy'));
    reply = await tap(pick(reply, 'Pagada'));
    check('pregunta dónde entró el pago', reply?.text.includes('Dónde entró el pago') === true, reply?.text);
    check('la captura sigue siendo una opción', Boolean(find(reply, 'Mando la captura')), titles(reply));
    reply = await tap(pick(reply, 'Caja dólares'));
    reply = await tap(pick(reply, 'Registrar'));
    check('acusa venta y cobro', reply?.text.includes('Cobro registrado') === true, reply?.text);

    const paidSale = await prisma.sale.findFirst({
      where: { companyId, clientId: buyer.id },
      orderBy: { createdAt: 'desc' },
    });
    check('la venta quedó pagada', paidSale?.paymentStatus === 'paid', paidSale?.paymentStatus);
    check('sin fecha de vencimiento', paidSale?.dueDate === null);

    console.log('\n7. Una venta fiada vence en el plazo configurado');

    reply = await type('venta');
    reply = await type('zoila');
    reply = await tap(pick(reply, 'Zoila Contado'));
    reply = await tap(pick(reply, 'Vivo'));
    reply = await tap(pick(reply, `${MARKER}-LOT`));
    reply = await type('2');
    reply = await type('4');
    reply = await type('4');
    reply = await tap(pick(reply, 'Hoy'));
    reply = await tap(pick(reply, 'Fiada'));
    reply = await tap(pick(reply, 'Registrar'));
    check('dice hasta cuándo queda fiada', reply?.text.includes('fiada hasta el') === true, reply?.text);

    const credit = await prisma.sale.findFirst({
      where: { companyId, clientId: buyer.id, paymentStatus: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    const days = credit?.dueDate && credit.saleDate
      ? Math.round((credit.dueDate.getTime() - credit.saleDate.getTime()) / 86_400_000)
      : null;
    check('con vencimiento a 7 días', days === 7, String(days));

    console.log('\n8. El menú ofrece lo que no necesita captura');

    const pay = await type('pagar');
    check('Pagos y gastos ofrece registrar un gasto', Boolean(find(pay, 'Registrar un gasto')), titles(pay));
    const collect = await type('cobrar');
    check('Cobrar ofrece el cobro sin captura', Boolean(find(collect, 'Cobro sin captura')), titles(collect));
    check('y cabe en diez filas', (collect.buttons?.length ?? 0) <= 10, String(collect.buttons?.length));

    const toEntry = await type('gasto 2 sacos de alimento');
    check('el alimento se manda a compras', /compra/i.test(toEntry.text), toEntry.text.slice(0, 160));
    if (find(toEntry, 'Cancelar')) await tap(pick(toEntry, 'Cancelar'));

    const paid = await type('pagué 2.450 bs a Carmen');
    check('"pagué" no abre un gasto nuevo', !paid.text.includes('Registrar un gasto*') && !paid.text.includes('¿Qué gasto es?'), paid.text.slice(0, 160));

    console.log('\n9. Resúmenes y tasa a pedido');

    const today = await type('resumen');
    check('resumen de hoy', today.text.includes('Resumen de hoy'), today.text.slice(0, 120));
    check('trae los gastos del día', today.text.includes('Gastos') && today.text.includes('Transporte'), today.text);
    check('y los saldos', today.text.includes(`${MARKER} Caja dólares`), today.text);

    const week = await type('semana');
    check('resumen de la semana', week.text.includes('Resumen de la semana'), week.text.slice(0, 120));
    check('dice quién debe', week.text.includes('Te deben') || week.text.includes('Nadie te debe'), week.text);

    const rateReply = await type('tasa');
    check('la tasa del BCV', rateReply.text.includes('BCV'), rateReply.text);

    console.log('\n10. Deshacer un gasto devuelve el dinero');

    const usdBeforeUndo = await balanceOf(usd.id);
    reply = await type('gasto 5$ flete');
    reply = await tap(pick(reply, 'Caja dólares'));
    reply = await tap(pick(reply, `${MARKER}-LOT`));
    reply = await tap(pick(reply, 'Registrar'));
    const undoExpense = pick(reply, 'Deshacer');
    check('el gasto sacó 5 dólares', (await balanceOf(usd.id)) === round2(usdBeforeUndo - 5), String(await balanceOf(usd.id)));

    reply = await tap(undoExpense);
    check('acusa que lo deshizo', reply?.text.includes('Deshice') === true, reply?.text);
    check('el saldo volvió a ser el de antes', (await balanceOf(usd.id)) === usdBeforeUndo, String(await balanceOf(usd.id)));
    check('el gasto ya no existe', (await prisma.transaction.count({ where: { companyId, description: 'Flete', accountId: usd.id } })) === 0);

    const again = await tap(undoExpense);
    check('deshacer dos veces no hace nada', again?.text.includes('ya lo deshice') === true, again?.text);

    console.log('\n11. Deshacer un cobro deja la venta debiendo otra vez');

    const paymentsBefore = await prisma.salePayment.count({ where: { saleId: newer.id } });
    reply = await type(`cobré 10$ ${MARKER} Pedro Cobranza`);
    reply = await tap(pick(reply, `${MARKER}-V2`));
    reply = await tap(pick(reply, 'Caja dólares'));
    reply = await tap(pick(reply, 'Registrar'));
    check('la venta subió a 30 pagados', Number((await prisma.sale.findUniqueOrThrow({ where: { id: newer.id } })).paidAmount) === 30);

    reply = await tap(pick(reply, 'Deshacer'));
    const newerUndone = await prisma.sale.findUniqueOrThrow({ where: { id: newer.id } });
    check('volvió a 20 pagados', Number(newerUndone.paidAmount) === 20 && newerUndone.paymentStatus === 'partial',
      `${newerUndone.paidAmount} ${newerUndone.paymentStatus}`);
    check('se fue el pago', (await prisma.salePayment.count({ where: { saleId: newer.id } })) === paymentsBefore);
    check('y su ingreso', (await prisma.transaction.count({ where: { companyId, sourceType: 'sale_payment', batchId: batch.id } })) ===
      (await prisma.salePayment.count({ where: { sale: { batchId: batch.id } } })));

    console.log('\n12. Dos cobros a la vez no se pisan');

    const race = await Promise.allSettled([
      salesService.registerPayment(companyId, newer.id, { amount: 5, accountId: usd.id }),
      salesService.registerPayment(companyId, newer.id, { amount: 5, accountId: usd.id }),
    ]);
    const raced = await prisma.sale.findUniqueOrThrow({ where: { id: newer.id } });
    const sumPaid = round2(
      (await prisma.salePayment.findMany({ where: { saleId: newer.id } })).reduce((s, p) => s + Number(p.amount), 0),
    );
    check('lo pagado en la venta es la suma de sus pagos', Number(raced.paidAmount) === sumPaid,
      `${raced.paidAmount} vs ${sumPaid} (${race.map((r) => r.status).join(', ')})`);
    check('al menos uno entró', race.some((r) => r.status === 'fulfilled'));

    console.log('\n13. Una venta con cobros no cambia lo vendido');

    const locked = await rejects(salesService.update(companyId, newer.id, { saleType: 'dead' }));
    check('no deja cambiar el tipo', Boolean(locked), 'aceptó el cambio');
    const notes = await rejects(salesService.update(companyId, newer.id, { notes: 'nota de prueba' }));
    check('sí deja cambiar las notas', notes === null, notes ?? '');

    console.log('\n14. Un cliente que debe no se borra');

    const deleted = await rejects(clientsService.remove(companyId, debtor.id));
    check('rechaza borrarlo', Boolean(deleted) && deleted!.includes('sin cobrar'), deleted ?? 'lo borró');
    check('y sigue ahí', Boolean(await prisma.client.findUnique({ where: { id: debtor.id } })));

    console.log('\n15. Bolívares hacia una cuenta en dólares se asientan en dólares');

    const usdBeforeVes = await balanceOf(usd.id);
    const vesExpense = await transactionsService.create(companyId, {
      type: 'expense', category: 'other', amount: round2(10 * rate), currency: 'VES', exchangeRate: rate,
      accountId: usd.id, description: `${MARKER} prueba moneda`,
    });
    check('salieron 10 dólares, no los bolívares', round2(usdBeforeVes - (await balanceOf(usd.id))) === 10,
      String(round2(usdBeforeVes - (await balanceOf(usd.id)))));
    await transactionsService.voidManual(companyId, vesExpense.id);
    check('anularlo lo devuelve', (await balanceOf(usd.id)) === usdBeforeVes);

    console.log('\n16. Los retiros del dueño no son gastos del negocio');

    const flowBefore = await transactionsService.getCashFlow(companyId);
    const draw = await transactionsService.create(companyId, {
      type: 'expense', category: 'owner_draw', amount: 100, currency: 'VES', accountId: ves.id,
    });
    const flowAfter = await transactionsService.getCashFlow(companyId);
    check('los gastos no cambian', flowAfter.expenses.bs === flowBefore.expenses.bs, `${flowBefore.expenses.bs} → ${flowAfter.expenses.bs}`);
    check('el retiro se ve aparte', round2(flowAfter.ownerDraw.bs - flowBefore.ownerDraw.bs) === 100);
    check('y sí baja la caja', round2(flowBefore.balance.bs - flowAfter.balance.bs) === 100);
    const manualVoid = await rejects(transactionsService.voidManual(companyId, draw.id));
    check('un registro manual se puede anular', manualVoid === null, manualVoid ?? '');

    console.log('\n17. Una venta vence después de su día, no el mismo día');

    const todayDate = startOfToday();
    const dueToday = await prisma.sale.create({
      data: {
        companyId, batchId: batch.id, clientId: buyer.id, code: `${MARKER}-HOY`, saleType: 'live',
        quantity: 1, totalAmount: 5, paymentStatus: 'pending', paidAmount: 0, dueDate: todayDate,
      },
    });
    const dueYesterday = await prisma.sale.create({
      data: {
        companyId, batchId: batch.id, clientId: buyer.id, code: `${MARKER}-AYER`, saleType: 'live',
        quantity: 1, totalAmount: 5, paymentStatus: 'pending', paidAmount: 0,
        dueDate: new Date(todayDate.getTime() - 86_400_000),
      },
    });
    const overdue = await reports.getOverdueSales(companyId);
    const overdueIds = new Set(overdue.map((sale) => (sale as { id?: string; saleId?: string }).id ?? (sale as { saleId?: string }).saleId));
    check('la que vence hoy no está vencida', !overdueIds.has(dueToday.id));
    check('la que venció ayer sí', overdueIds.has(dueYesterday.id), JSON.stringify(overdue.slice(0, 2)));
  } finally {
    console.log('\nLimpiando...');
    await prisma.botFlowSession.deleteMany({ where: { channel: CHANNEL } });
    if (made.accountIds.length > 0) {
      await prisma.accountMovement.deleteMany({ where: { accountId: { in: made.accountIds } } });
      await prisma.transaction.deleteMany({ where: { accountId: { in: made.accountIds } } });
    }
    if (made.batchId) {
      await prisma.transaction.deleteMany({ where: { batchId: made.batchId } });
      await prisma.salePayment.deleteMany({ where: { sale: { batchId: made.batchId } } });
      await prisma.sale.deleteMany({ where: { batchId: made.batchId } });
      await prisma.batch.deleteMany({ where: { id: made.batchId } });
    }
    if (made.accountIds.length > 0) await prisma.account.deleteMany({ where: { id: { in: made.accountIds } } });
    if (made.clientIds.length > 0) await prisma.client.deleteMany({ where: { id: { in: made.clientIds } } });
    if (made.warehouseId) await prisma.warehouse.deleteMany({ where: { id: made.warehouseId } });
    await app.close();
  }

  if (failures === 0) console.log('\nTodo en verde.');
  else {
    console.log(`\n${failures} verificación(es) fallaron.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
