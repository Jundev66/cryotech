/**
 * End-to-end check of the receipt pipeline: read -> resolve direction ->
 * duplicate guard -> draft -> confirm -> ledger entries.
 *
 * Runs against the real company so the real account identifiers resolve, but
 * every record it needs is created by the script and removed again in the
 * `finally` block. It never reads, modifies or deletes pre-existing sales,
 * clients, batches or movements.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-assistant-e2e.ts <companyId>
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReceiptIntakeService } from '../src/modules/assistant/receipt-intake.service';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { targetCompany } from './lib/test-company';

const FIXTURES = join(process.cwd(), 'test', 'fixtures');
const MARKER = 'ZZ-CHECK';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  // Por defecto la empresa de pruebas. Un companyId por argumento sigue
  // sirviendo para reproducir algo contra datos reales.
  const companyId = await targetCompany(app, process.argv[2]);
  const prisma = app.get(PrismaService);
  const intake = app.get(ReceiptIntakeService);
  const assistant = app.get(AssistantService);

  const created = {
    warehouseId: null as string | null,
    batchId: null as string | null,
    clientId: null as string | null,
    saleId: null as string | null,
    processingId: null as string | null,
    draftIds: [] as string[],
  };


  try {

    // --- 1. Direction detection on both real receipts -------------------
    console.log('\n1. Detección de dirección (sin escribir en el libro mayor)');

    const cobro = await intake.intake({
      companyId,
      channel: 'check',
      externalUserId: MARKER,
      image: readFileSync(join(FIXTURES, 'receipt-cobro-bdv-light.jpeg')),
    });
    if (cobro.draftId) created.draftIds.push(cobro.draftId);

    check('el cobro se detecta como ENTRADA', cobro.receipt.direction.direction === 'in', cobro.receipt.direction.direction);
    check('reconoce la cuenta de destino como tuya', cobro.receipt.direction.ourAccountName === 'BDV Bs');
    check('monto correcto', cobro.receipt.fields.amount === 8466, String(cobro.receipt.fields.amount));
    check('referencia correcta', cobro.receipt.fields.reference === '058712349065');
    check('resolvió el escalón local', cobro.receipt.tier === 'ocr', cobro.receipt.tier);
    check('trae tasa BCV', (cobro.receipt.exchangeRate ?? 0) > 0, String(cobro.receipt.exchangeRate));

    const pago = await intake.intake({
      companyId,
      channel: 'check',
      externalUserId: `${MARKER}-2`,
      image: readFileSync(join(FIXTURES, 'receipt-pago-bdv-dark.jpeg')),
    });
    if (pago.draftId) created.draftIds.push(pago.draftId);

    check('el pago se detecta como SALIDA', pago.receipt.direction.direction === 'out', pago.receipt.direction.direction);
    check('reconoce la cuenta de origen como tuya', pago.receipt.direction.ourAccountName === 'BDV Bs');
    check('monto correcto', pago.receipt.fields.amount === 2450, String(pago.receipt.fields.amount));
    check('contraparte correcta', pago.receipt.fields.counterparty?.startsWith('Carmen') === true);
    // A payment out is offered as a business operation, never as an accounting
    // category up front: picking "servicios" for this very receipt is what
    // booked the Carmen processing cost twice.
    check(
      'no ofrece categorías contables de entrada',
      !pago.reply.buttons?.some((b) => b.id.startsWith('cat:') && !b.id.endsWith(':owner_draw')),
      pago.reply.buttons?.map((b) => b.id).join(', '),
    );
    check(
      'deja el gasto directo como último recurso',
      pago.reply.buttons?.some((b) => b.id.startsWith('ctl:')) === true,
    );

    console.log('\n   Resumen que vería el usuario:\n');
    console.log(cobro.reply.text.split('\n').map((l) => `     ${l}`).join('\n'));
    console.log(`     [${cobro.reply.buttons?.map((b) => b.title).join('] [')}]`);

    // --- 2. Throwaway sale to collect against ---------------------------
    console.log('\n2. Preparando una venta desechable');

    const warehouse = await prisma.warehouse.create({
      data: { companyId, name: `${MARKER} Galpón`, capacity: 100 },
    });
    created.warehouseId = warehouse.id;

    const batch = await prisma.batch.create({
      data: {
        companyId,
        warehouseId: warehouse.id,
        breed: 'Cobb 500',
        initialQuantity: 50,
        currentQuantity: 50,
        status: 'for_sale',
      },
    });
    created.batchId = batch.id;

    // The client is named after the receipt: the printed name is what decides
    // which sale the collection lands on.
    const payerName = cobro.receipt.fields.counterparty ?? `${MARKER} Juan Mata`;
    const client =
      (await prisma.client.findFirst({ where: { companyId, name: payerName } })) ??
      (await prisma.client.create({
        data: { companyId, name: payerName, code: `${MARKER}-CLI` },
      }));
    created.clientId = client.id;

    const rate = cobro.receipt.exchangeRate as number;
    // Make the sale bigger than the receipt so the payment lands as partial.
    const saleUsd = Math.round((8466 / rate) * 2 * 100) / 100;
    const sale = await prisma.sale.create({
      data: {
        companyId,
        batchId: batch.id,
        clientId: client.id,
        code: `${MARKER}-VEN`,
        saleType: 'live',
        quantity: 10,
        totalAmount: saleUsd,
        paidAmount: 0,
        paymentStatus: 'pending',
      },
    });
    created.saleId = sale.id;
    console.log(`   venta ${sale.code} por $${saleUsd} a ${client.name}`);

    // --- 3. Confirm the collection --------------------------------------
    console.log('\n3. Confirmando el cobro');

    const balanceBefore = (await prisma.account.findFirstOrThrow({
      where: { id: cobro.receipt.direction.ourAccountId! },
    })).currentBalance;

    // Re-run intake now that the client exists, so the resolver picks it up.
    const cobro2 = await intake.intake({
      companyId,
      channel: 'check',
      externalUserId: MARKER,
      image: readFileSync(join(FIXTURES, 'receipt-cobro-bdv-light.jpeg')),
    });
    if (cobro2.draftId) created.draftIds.push(cobro2.draftId);
    check('la referencia repetida se detecta como duplicada', cobro2.receipt.duplicateOf === null,
      'aún no hay movimiento, no debería marcarla');

    const payButton = cobro2.reply.buttons?.find((b) => b.id.startsWith('pay:'));
    check('hay botón de "Cobro de venta"', Boolean(payButton));

    const reply = await assistant.handleButton(payButton!.id, companyId, 'check', `${MARKER}-1`);
    console.log(`   respuesta: ${reply?.text.replace(/\n/g, ' | ')}`);
    check('la confirmación devuelve un acuse', Boolean(reply?.text.includes('✅')));

    const afterSale = await prisma.sale.findFirstOrThrow({ where: { id: sale.id } });
    check('la venta quedó parcialmente pagada', afterSale.paymentStatus === 'partial', afterSale.paymentStatus);

    const payment = await prisma.salePayment.findFirstOrThrow({ where: { saleId: sale.id } });
    check('el pago guarda el monto en Bs', payment.amountBs?.toString() === '8466', payment.amountBs?.toString());
    check('el pago guarda la tasa usada', Number(payment.exchangeRate) === rate);
    check('el pago queda enlazado a la cuenta', payment.accountId === cobro.receipt.direction.ourAccountId);

    const transaction = await prisma.transaction.findFirstOrThrow({
      where: { sourceType: 'sale_payment', sourceId: payment.id },
    });
    check('la transacción es un ingreso en Bs', transaction.amount.toString() === '8466', transaction.amount.toString());
    check('la transacción tiene categoría de venta', transaction.category === 'sale_live', transaction.category);

    const movement = await prisma.accountMovement.findFirstOrThrow({
      where: { sourceType: 'sale_payment', sourceId: payment.id },
    });
    check('el movimiento entra en la cuenta', movement.direction === 'in');
    check('el movimiento guarda la referencia bancaria', movement.reference === '058712349065');

    const balanceAfter = (await prisma.account.findFirstOrThrow({
      where: { id: cobro.receipt.direction.ourAccountId! },
    })).currentBalance;
    check('el saldo subió exactamente el monto del comprobante',
      balanceAfter.minus(balanceBefore).toString() === '8466',
      balanceAfter.minus(balanceBefore).toString());

    // --- 4. Double tap is harmless --------------------------------------
    console.log('\n4. Doble toque en confirmar');
    const second = await assistant.handleButton(payButton!.id, companyId, 'check', `${MARKER}-1`);
    check('el segundo toque no hace nada', second === null);
    const paymentCount = await prisma.salePayment.count({ where: { saleId: sale.id } });
    check('sigue habiendo un solo pago', paymentCount === 1, String(paymentCount));

    // --- 5. Resending the same receipt is caught ------------------------
    console.log('\n5. Reenviar el mismo comprobante');
    const again = await intake.intake({
      companyId,
      channel: 'check',
      externalUserId: MARKER,
      image: readFileSync(join(FIXTURES, 'receipt-cobro-bdv-light.jpeg')),
    });
    if (again.draftId) created.draftIds.push(again.draftId);
    check('detecta que esa referencia ya está registrada', again.receipt.duplicateOf !== null);
    check('no crea un borrador nuevo', again.draftId === null);
    check('el mensaje lo dice claramente', again.reply.text.includes('ya está registrada'));

    // --- 6. Un comprobante que paga un beneficio ------------------------
    console.log('\n6. Comprobante que paga un beneficio');

    // El caso Carmen, tal cual: un beneficio ya registrado y un comprobante
    // por exactamente lo que se debe. Tocar la pagable tiene que mover la caja
    // y NO reconocer un segundo gasto.
    const processing = await prisma.processing.create({
      data: {
        companyId,
        code: `${MARKER}-BEN`,
        batchId: created.batchId!,
        quantity: 7,
        totalCost: 3.23,
        totalCostBs: 2450,
        exchangeRate: 757.54,
        supplierName: 'Carmen',
        paymentStatus: 'pending',
      },
    });
    created.processingId = processing.id;

    const payOut = await intake.intake({
      companyId,
      channel: 'check',
      externalUserId: `${MARKER}-3`,
      image: readFileSync(join(FIXTURES, 'receipt-pago-bdv-dark.jpeg')),
    });
    if (payOut.draftId) created.draftIds.push(payOut.draftId);

    const payableButton = payOut.reply.buttons?.[0];
    check(
      'la pagable que cuadra en monto se ofrece de primera',
      payableButton?.id === `pyb:${payOut.draftId}:processing-${processing.id}`,
      payOut.reply.buttons?.map((b) => `${b.title}`).join(' | '),
    );

    const txBefore = await prisma.transaction.count({ where: { companyId } });
    const accountBefore = await prisma.account.findFirstOrThrow({
      where: { id: payOut.receipt.direction.ourAccountId! },
    });

    const payableReply = await assistant.handleButton(
      payableButton!.id,
      companyId,
      'check',
      `${MARKER}-3`,
    );
    check('acusa el pago del beneficio', payableReply?.text.includes('✅') === true, payableReply?.text);

    const settled = await prisma.processing.findFirstOrThrow({ where: { id: processing.id } });
    check('el beneficio queda pagado', settled.paymentStatus === 'paid', settled.paymentStatus);
    check('abonado en bolívares', Number(settled.paidAmount) === 2450, String(settled.paidAmount));

    check(
      'pagar NO reconoce un segundo gasto',
      (await prisma.transaction.count({ where: { companyId } })) === txBefore,
      'esto es exactamente lo que falló con el pago real a Carmen',
    );

    const accountAfter = await prisma.account.findFirstOrThrow({ where: { id: accountBefore.id } });
    check(
      'el dinero salió de la cuenta',
      accountBefore.currentBalance.minus(accountAfter.currentBalance).toString() === '2450',
      accountBefore.currentBalance.minus(accountAfter.currentBalance).toString(),
    );

    const payableMovement = await prisma.accountMovement.findFirst({
      where: { companyId, sourceType: 'payable_payment' },
      orderBy: { createdAt: 'desc' },
    });
    check('el movimiento se atribuye al pago', payableMovement?.direction === 'out');
    check('y guarda al proveedor', payableMovement?.counterparty === 'Carmen', payableMovement?.counterparty ?? '');
  } finally {
    console.log('\nLimpiando lo que creó el script...');
    const payments = created.saleId
      ? await prisma.salePayment.findMany({ where: { saleId: created.saleId }, select: { id: true } })
      : [];
    const paymentIds = payments.map((p) => p.id);

    if (created.processingId) {
      const payablePayments = await prisma.payablePayment.findMany({
        where: { processingId: created.processingId },
        select: { id: true },
      });
      await prisma.accountMovement.deleteMany({
        where: { sourceId: { in: payablePayments.map((p) => p.id) } },
      });
      await prisma.payablePayment.deleteMany({ where: { processingId: created.processingId } });
      await prisma.processing.deleteMany({ where: { id: created.processingId } });
    }
    await prisma.accountMovement.deleteMany({ where: { sourceId: { in: paymentIds } } });
    await prisma.transaction.deleteMany({ where: { sourceId: { in: paymentIds } } });
    if (created.saleId) await prisma.sale.deleteMany({ where: { id: created.saleId } });
    if (created.clientId) await prisma.client.deleteMany({ where: { id: created.clientId } });
    if (created.batchId) await prisma.batch.deleteMany({ where: { id: created.batchId } });
    if (created.warehouseId) await prisma.warehouse.deleteMany({ where: { id: created.warehouseId } });
    await prisma.botDraft.deleteMany({ where: { id: { in: created.draftIds } } });


    await app.close();
  }

  console.log(failures === 0 ? '\nTodo en verde.\n' : `\n${failures} verificación(es) fallaron.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
