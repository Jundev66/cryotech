/**
 * Corrects the first payment the bot ever registered.
 *
 * Bs 2.450 paid to Carmen for slaughtering 7 birds was filed as a fresh
 * "servicios" expense (TRX-2600091). But BEN-2600005 had already recognised
 * that cost as TRX-2600086, so the expense was counted twice. The one thing the
 * bot did add was the treasury movement — TRX-2600086 has no account, so as far
 * as the system knew that money never left the bank.
 *
 * So: keep the movement, re-point it at a real payment against the processing,
 * and delete the duplicate expense.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/fix-duplicate-processing-expense.ts <companyId>          # dry run
 *   npx ts-node -P tsconfig.json --transpile-only scripts/fix-duplicate-processing-expense.ts <companyId> --apply
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MovementsService } from '../src/modules/treasury/movements.service';

const DUPLICATE_CODE = 'TRX-2600091';
const PROCESSING_CODE = 'BEN-2600005';
const SUPPLIER = 'Carmen Rivas Peña';

async function main() {
  const companyId = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!companyId) {
    throw new Error('usage: fix-duplicate-processing-expense.ts <companyId> [--apply]');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);

  try {
    const processing = await prisma.processing.findFirst({
      where: { companyId, code: PROCESSING_CODE },
    });
    if (!processing) throw new Error(`No encontré ${PROCESSING_CODE} en esta empresa`);

    const duplicate = await prisma.transaction.findFirst({
      where: { companyId, code: DUPLICATE_CODE },
    });

    if (!duplicate) {
      console.log(`${DUPLICATE_CODE} ya no existe — la corrección ya se aplicó.`);
      return;
    }

    const movement = await prisma.accountMovement.findFirst({
      where: { companyId, sourceType: 'transaction', sourceId: duplicate.id },
    });
    if (!movement) {
      throw new Error(
        `${DUPLICATE_CODE} no tiene movimiento de tesorería asociado. Revísalo a mano antes de borrarlo.`,
      );
    }

    const amount = Number(duplicate.amount);
    const owed = Number(processing.totalCostBs ?? 0);
    if (Math.abs(amount - owed) > 0.01) {
      throw new Error(
        `El gasto duplicado (Bs ${amount}) no coincide con el saldo del beneficio (Bs ${owed}). No toco nada.`,
      );
    }

    console.log(`\nGasto duplicado : ${duplicate.code} · ${duplicate.category} · Bs ${amount}`);
    console.log(`Beneficio       : ${processing.code} · ${processing.quantity} aves · Bs ${owed}`);
    console.log(`Movimiento      : ${movement.id} · ref ${movement.reference ?? '—'} (se conserva)`);
    console.log('\nQué va a pasar:');
    console.log(`  1. Se crea el abono de Bs ${amount} contra ${processing.code}, que queda pagado`);
    console.log('  2. El movimiento de tesorería se reapunta a ese abono');
    console.log(`  3. Se elimina ${duplicate.code}, el gasto duplicado`);

    if (!apply) {
      console.log('\n(simulación — vuelve a correrlo con --apply para escribir)');
      return;
    }

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payablePayment.create({
        data: {
          companyId,
          processingId: processing.id,
          amount,
          exchangeRate: processing.exchangeRate,
          amountUsd: processing.exchangeRate
            ? Math.round((amount / Number(processing.exchangeRate)) * 100) / 100
            : null,
          accountId: movement.accountId,
          reference: movement.reference,
          paymentDate: movement.movementDate,
          notes: `Corrección de ${duplicate.code}`,
        },
      });

      await tx.processing.update({
        where: { id: processing.id },
        data: {
          paidAmount: amount,
          paymentStatus: 'paid',
          // The receipt named the counterparty; the processing never recorded it.
          supplierName: processing.supplierName ?? SUPPLIER,
        },
      });

      // The money did leave the bank, so the movement stays exactly as it is —
      // same amount, same date, same reference. Only what it points at changes.
      await tx.accountMovement.update({
        where: { id: movement.id },
        data: {
          sourceType: 'payable_payment',
          sourceId: payment.id,
          counterparty: movement.counterparty ?? SUPPLIER,
          concept: `Pago de beneficio ${processing.code} · Beneficio de ${processing.quantity} aves`,
        },
      });

      await tx.transaction.delete({ where: { id: duplicate.id } });
    });

    console.log('\nListo. Verificando...');

    const remaining = await prisma.transaction.findMany({
      where: { companyId, category: 'processing', sourceId: processing.id },
      select: { code: true, amount: true, category: true },
    });
    const settled = await prisma.processing.findFirstOrThrow({ where: { id: processing.id } });
    const reconcile = await app.get(MovementsService).recomputeBalances(companyId, false);

    console.log(
      `  gasto de beneficio  : ${remaining.length} × ${remaining.map((t) => `${t.code} Bs ${t.amount}`).join(', ')}`,
    );
    console.log(`  ${processing.code}        : ${settled.paymentStatus} · abonado Bs ${settled.paidAmount}`);
    console.log(
      `  saldos de tesorería : ${reconcile.mismatches.length === 0 ? 'cuadran' : JSON.stringify(reconcile.mismatches)}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
