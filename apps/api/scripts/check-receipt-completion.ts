/**
 * A receipt the free reader could only half read is finished by chatting, not
 * turned away: the missing amount, date, reference and account are asked one
 * at a time, and the payment then spreads over the client's open sales.
 *
 * The draft is built by hand with every field blank, exactly as the reader
 * leaves it on a screenshot it cannot parse, so no image or OCR is involved.
 * Creates everything it needs and removes it again.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-receipt-completion.ts [companyId]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { DraftService } from '../src/modules/assistant/drafts/draft.service';
import { ReceiptQueueService } from '../src/modules/assistant/queue/receipt-queue.service';
import { ExchangeRatesService } from '../src/modules/exchange-rates/exchange-rates.service';
import { formatAmount } from '../src/modules/assistant/formatting/number.format';
import { DRAFT_INTENT, type OutgoingMessage } from '../src/modules/assistant/types/assistant.types';
import { targetCompany } from './lib/test-company';

const MARKER = 'ZZ-RC';
const CHANNEL = 'check-receipt-completion';
const USER = 'ZZ-RC-USER';

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

function pick(reply: OutgoingMessage | null, match: string): string {
  const button = reply?.buttons?.find((b) => b.title.includes(match));
  if (!button) throw new Error(`No hay opción "${match}" en: ${titles(reply)} — ${reply?.text?.slice(0, 240)}`);
  return button.id;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const companyId = await targetCompany(app, process.argv[2]);
  const prisma = app.get(PrismaService);
  const assistant = app.get(AssistantService);
  const drafts = app.get(DraftService);
  const queue = app.get(ReceiptQueueService);
  const exchangeRates = app.get(ExchangeRatesService);

  const tap = (id: string) => assistant.handleButton(id, companyId, CHANNEL, USER);
  const type = (text: string) => assistant.handleText(text, companyId, CHANNEL, USER);

  const made = {
    warehouseId: null as string | null,
    batchId: null as string | null,
    clientId: null as string | null,
    accountId: null as string | null,
  };

  // Unique per run: a reference is unique per company in treasury.
  const reference = String(Date.now()).slice(-10);

  try {
    console.log('\n1. Preparando cuenta, lote y un cliente con dos ventas');

    await prisma.botDraft.deleteMany({ where: { channel: CHANNEL } });
    await prisma.botFlowSession.deleteMany({ where: { channel: CHANNEL } });

    const warehouse = await prisma.warehouse.create({ data: { companyId, name: `${MARKER} Galpón` } });
    made.warehouseId = warehouse.id;
    const batch = await prisma.batch.create({
      data: {
        companyId, code: `${MARKER}-LOT`, warehouseId: warehouse.id, breed: 'Cobb 500',
        initialQuantity: 100, currentQuantity: 100, status: 'for_sale',
      },
    });
    made.batchId = batch.id;

    const account = await prisma.account.create({
      data: { companyId, name: `${MARKER} Banco Bs`, kind: 'bank', currency: 'VES' },
    });
    made.accountId = account.id;

    const client = await prisma.client.create({
      data: { companyId, code: `${MARKER}-C1`, name: `${MARKER} Pedro Cobranza` },
    });
    made.clientId = client.id;

    const older = await prisma.sale.create({
      data: {
        companyId, batchId: batch.id, clientId: client.id, code: `${MARKER}-V1`, saleType: 'live',
        quantity: 5, totalAmount: 30, paymentStatus: 'pending', paidAmount: 0,
        saleDate: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    const newer = await prisma.sale.create({
      data: {
        companyId, batchId: batch.id, clientId: client.id, code: `${MARKER}-V2`, saleType: 'live',
        quantity: 5, totalAmount: 40, paymentStatus: 'pending', paidAmount: 0,
        saleDate: new Date('2026-09-05T00:00:00.000Z'),
      },
    });

    const current = await exchangeRates.getCurrentRate(companyId);
    const rate = current.effectiveRate;
    check('hay tasa', !current.unavailable && rate > 0, JSON.stringify(current));

    // Fifty dollars in bolivares: thirty settle the older sale, twenty go to the next.
    const amountBs = round2(50 * rate);

    const draft = await drafts.create({
      companyId,
      channel: CHANNEL,
      externalUserId: USER,
      intent: DRAFT_INTENT.RECEIPT_INCOMPLETE,
      readerTier: 'failed',
      entities: {
        amount: null, currency: null, date: null, reference: null,
        counterparty: 'Transferencia Recibida', concept: null, bankName: 'Banco de Venezuela',
        origin: null, destination: null,
      },
      resolved: {
        direction: 'unknown', ourAccountId: null, ourAccountName: null,
        counterAccountId: null, counterAccountName: null,
        exchangeRate: rate, exchangeRateStale: false,
        clientId: null, clientName: null, clientIsNew: false, alternativeClientId: null,
        awaiting: ['amount', 'date', 'reference', 'direction', 'account'],
      },
    });

    console.log('\n2. Pide lo que no pudo leer, una cosa a la vez');

    let reply: OutgoingMessage | null = await queue.presentNext(CHANNEL, USER);
    check('empieza por el monto', reply?.text.includes('No pude leer el *monto*') === true, reply?.text);
    check('se puede descartar', Boolean(reply?.buttons?.some((b) => b.title.includes('Descartar'))), titles(reply));

    // A new operation typed while the receipt waits is not its amount.
    const other = await type('gasto 20$ gasoil');
    check('"gasto 20$ gasoil" no se toma como el monto', !other.text.includes('fecha'), other.text.slice(0, 160));
    const untouched = await prisma.botDraft.findUniqueOrThrow({ where: { id: draft.id } });
    check('el comprobante sigue sin monto', (untouched.entities as Record<string, unknown>).amount === null);
    await type('cancelar');

    reply = await type(formatAmount(amountBs));
    check('acepta el monto escrito y pide la fecha', reply.text.includes('No pude leer la *fecha*'), reply.text);
    const dateButton = pick(reply, 'Ayer');

    reply = await tap(dateButton);
    check('pide la referencia', reply?.text.includes('No pude leer la *referencia*') === true, reply?.text);

    const stale = await tap(dateButton);
    check('volver a tocar la fecha no hace nada', stale === null, stale?.text);

    reply = await type(`${reference.slice(0, 5)} ${reference.slice(5)}`);
    check('acepta la referencia con espacios y pregunta si entró o salió',
      reply.text.includes('entró o salió'), reply.text);

    reply = await tap(pick(reply, 'Me pagaron'));
    check('pregunta a qué cuenta entró', reply?.text.includes('A qué cuenta entró') === true, reply?.text);
    reply = await tap(pick(reply, `${MARKER} Banco Bs`));

    check('ya completo, se muestra como una entrada', reply?.text.includes('ENTRADA') === true, reply?.text);
    const stored = await prisma.botDraft.findUniqueOrThrow({ where: { id: draft.id } });
    const entities = stored.entities as Record<string, unknown>;
    check('guardó el monto en bolívares', entities.amount === amountBs && entities.currency === 'VES',
      `${entities.amount} ${entities.currency}`);
    check('guardó la referencia sin espacios', entities.reference === reference, String(entities.reference));

    console.log('\n3. Sin cliente seguro, pregunta quién pagó');

    const payRow = reply?.buttons?.find((b) => b.title.includes('Cobro de venta'));
    check('el cobro pregunta el cliente antes de registrar', payRow?.id.startsWith('cpk:') === true, payRow?.id);

    reply = await tap(payRow!.id);
    check('muestra quién debe', reply?.text.includes('¿Quién te pagó?') === true, reply?.text);
    check('con el nombre que leyó de la captura', reply?.text.includes('Transferencia Recibida') === true, reply?.text);

    reply = await tap(pick(reply, `${MARKER} Pedro Cobranza`));
    check('acusa el reparto', reply?.text.includes('repartido en 2 ventas') === true, reply?.text);

    const olderAfter = await prisma.sale.findUniqueOrThrow({ where: { id: older.id } });
    const newerAfter = await prisma.sale.findUniqueOrThrow({ where: { id: newer.id } });
    check('la vieja quedó pagada', olderAfter.paymentStatus === 'paid', olderAfter.paymentStatus);
    check('la nueva recibió el resto', newerAfter.paymentStatus === 'partial' && Number(newerAfter.paidAmount) === 20,
      `${newerAfter.paymentStatus} ${newerAfter.paidAmount}`);

    const payments = await prisma.salePayment.findMany({ where: { saleId: { in: [older.id, newer.id] } } });
    const totalBs = round2(payments.reduce((sum, payment) => sum + Number(payment.amountBs ?? 0), 0));
    check('los bolívares suman exacto lo del banco', totalBs === amountBs, `${totalBs} vs ${amountBs}`);

    const movements = await prisma.accountMovement.findMany({ where: { accountId: account.id } });
    check('entró todo en la cuenta', round2(movements.reduce((s, m) => s + Number(m.amount), 0)) === amountBs,
      movements.map((m) => String(m.amount)).join('+'));
    check('con la referencia en un solo movimiento', movements.filter((m) => m.reference === reference).length === 1);

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    check('con la fecha que se eligió', payments.every((p) => p.paymentDate.toISOString().slice(0, 10) <= yesterday),
      payments.map((p) => p.paymentDate.toISOString().slice(0, 10)).join(','));

    console.log('\n4. Una referencia que ya existe descarta el comprobante');

    const repeat = await drafts.create({
      companyId,
      channel: CHANNEL,
      externalUserId: USER,
      intent: DRAFT_INTENT.RECEIPT_IN,
      readerTier: 'failed',
      entities: {
        amount: 100, currency: 'VES', date: yesterday, reference: null,
        counterparty: null, concept: null, bankName: null, origin: null, destination: null,
      },
      resolved: {
        direction: 'in', ourAccountId: account.id, ourAccountName: account.name,
        counterAccountId: null, counterAccountName: null, exchangeRate: rate,
        clientId: null, clientName: null, clientIsNew: false, alternativeClientId: null,
        awaiting: ['reference'],
      },
    });

    reply = await type(reference);
    check('avisa que ya está registrada', reply.text.includes('ya está registrada'), reply.text);
    const cancelled = await prisma.botDraft.findUniqueOrThrow({ where: { id: repeat.id } });
    check('y lo descarta', cancelled.status === 'cancelled', cancelled.status);
  } finally {
    console.log('\nLimpiando...');
    await prisma.botDraft.deleteMany({ where: { channel: CHANNEL } });
    await prisma.botFlowSession.deleteMany({ where: { channel: CHANNEL } });
    if (made.accountId) {
      await prisma.accountMovement.deleteMany({ where: { accountId: made.accountId } });
      await prisma.transaction.deleteMany({ where: { accountId: made.accountId } });
    }
    if (made.batchId) {
      await prisma.transaction.deleteMany({ where: { batchId: made.batchId } });
      await prisma.salePayment.deleteMany({ where: { sale: { batchId: made.batchId } } });
      await prisma.sale.deleteMany({ where: { batchId: made.batchId } });
      await prisma.batch.deleteMany({ where: { id: made.batchId } });
    }
    if (made.accountId) await prisma.account.deleteMany({ where: { id: made.accountId } });
    if (made.clientId) await prisma.client.deleteMany({ where: { id: made.clientId } });
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
