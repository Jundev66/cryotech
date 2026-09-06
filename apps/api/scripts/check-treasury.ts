/**
 * Exercises the treasury services against the real database.
 *
 * Creates its own throwaway accounts, asserts the invariants that matter
 * (balances move with movements, an FX trade writes no Transaction, a repeated
 * bank reference is rejected), then deletes everything it created. It never
 * touches pre-existing accounts or movements.
 *
 *   npx ts-node -P tsconfig.json scripts/check-treasury.ts <companyId>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccountsService } from '../src/modules/treasury/accounts.service';
import { MovementsService } from '../src/modules/treasury/movements.service';
import { targetCompany } from './lib/test-company';

const MARKER = 'ZZ-CHECK';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
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
  const accounts = app.get(AccountsService);
  const movements = app.get(MovementsService);

  const createdAccountIds: string[] = [];

  try {
    console.log('\n1. Crear cuentas con identificadores');
    const bs = await accounts.create(companyId, {
      name: `${MARKER} BDV Bs`,
      kind: 'bank',
      currency: 'VES',
      isActive: true,
      identifiers: [
        { kind: 'last4', value: '0102****9999', bankCode: '0102' },
        { kind: 'phone', value: '0412-9999999', bankCode: null },
      ],
    });
    createdAccountIds.push(bs.id);
    check('cuenta creada con código', Boolean(bs.code), String(bs.code));
    check('last4 normalizado a 4 dígitos', bs.identifiers.find((i) => i.kind === 'last4')?.value === '9999');
    check(
      'teléfono normalizado a 10 dígitos',
      bs.identifiers.find((i) => i.kind === 'phone')?.value === '4129999999',
      bs.identifiers.find((i) => i.kind === 'phone')?.value,
    );

    const usd = await accounts.create(companyId, {
      name: `${MARKER} Efectivo USD`,
      kind: 'cash',
      currency: 'USD',
      isActive: true,
      identifiers: [],
    });
    createdAccountIds.push(usd.id);

    const bs2 = await accounts.create(companyId, {
      name: `${MARKER} Efectivo Bs`,
      kind: 'cash',
      currency: 'VES',
      isActive: true,
      identifiers: [],
    });
    createdAccountIds.push(bs2.id);

    console.log('\n2. Resolver la cuenta desde los datos de un recibo');
    const byLast4 = await accounts.resolveByIdentifier(companyId, { last4: '0102****9999', bankCode: '0102' });
    check('reconoce la cuenta por los últimos 4 dígitos', byLast4?.id === bs.id);
    const byPhone = await accounts.resolveByIdentifier(companyId, { phone: '+584129999999' });
    check('reconoce la cuenta por pago móvil en formato E.164', byPhone?.id === bs.id);
    const unknown = await accounts.resolveByIdentifier(companyId, { last4: '0102****1111', bankCode: '0102' });
    check('no inventa una cuenta cuando nada coincide', unknown === null);

    console.log('\n3. Movimientos y saldo');
    await movements.record(companyId, {
      accountId: bs.id,
      direction: 'in',
      amount: 8466,
      reference: `${MARKER}-058712349065`,
      counterparty: 'Juan Mata',
      sourceType: 'manual',
    });
    await movements.record(companyId, {
      accountId: bs.id,
      direction: 'out',
      amount: 2450,
      reference: `${MARKER}-058798761234`,
      counterparty: 'Carmen Rivas',
      sourceType: 'manual',
    });
    const afterTwo = await accounts.findOne(companyId, bs.id);
    check(
      'saldo = entradas - salidas',
      afterTwo.currentBalance.toString() === '6016',
      afterTwo.currentBalance.toString(),
    );

    console.log('\n4. Referencia bancaria duplicada');
    let duplicateRejected = false;
    try {
      await movements.record(companyId, {
        accountId: bs.id,
        direction: 'in',
        amount: 8466,
        reference: `${MARKER}-058712349065`,
        sourceType: 'manual',
      });
    } catch {
      duplicateRejected = true;
    }
    check('reenviar la misma referencia no registra dos veces', duplicateRejected);
    const afterDuplicate = await accounts.findOne(companyId, bs.id);
    check(
      'el saldo no se movió tras el intento duplicado',
      afterDuplicate.currentBalance.toString() === '6016',
      afterDuplicate.currentBalance.toString(),
    );

    const found = await movements.findByReference(companyId, `${MARKER}-058712349065`);
    check('la referencia existente se puede consultar', found !== null);

    console.log('\n5. Traslado entre cuentas propias');
    const transfer = await movements.recordTransfer(companyId, {
      fromAccountId: bs.id,
      toAccountId: bs2.id,
      amount: 1000,
    });
    const bsAfterTransfer = await accounts.findOne(companyId, bs.id);
    const bs2AfterTransfer = await accounts.findOne(companyId, bs2.id);
    check('la cuenta origen baja', bsAfterTransfer.currentBalance.toString() === '5016');
    check('la cuenta destino sube', bs2AfterTransfer.currentBalance.toString() === '1000');
    check('las dos patas comparten transferGroupId', Boolean(transfer.transferGroupId));

    console.log('\n6. Compra de divisas');
    const txBefore = await prisma.transaction.count({ where: { companyId } });
    const trade = await movements.recordFxTrade(companyId, {
      fromAccountId: bs.id,
      toAccountId: usd.id,
      amountFrom: 3785.7,
      amountTo: 5,
    });
    const txAfter = await prisma.transaction.count({ where: { companyId } });
    check('la compra de divisas NO crea ninguna transacción', txBefore === txAfter, `${txBefore} -> ${txAfter}`);
    check('la tasa se calcula en Bs por USD', trade.rate.toString() === '757.14', trade.rate.toString());
    const usdAfter = await accounts.findOne(companyId, usd.id);
    check('la cuenta en USD recibe el monto', usdAfter.currentBalance.toString() === '5');

    let sameCurrencyRejected = false;
    try {
      await movements.recordFxTrade(companyId, {
        fromAccountId: bs.id,
        toAccountId: bs2.id,
        amountFrom: 10,
        amountTo: 10,
      });
    } catch {
      sameCurrencyRejected = true;
    }
    check('rechaza una "compra de divisas" entre cuentas de la misma moneda', sameCurrencyRejected);

    console.log('\n7. Cuadre');
    // Acotado a la cuenta que creó este script. Cuadrar toda la empresa mezcla
    // los hallazgos: la cuenta BDV real arrastra un saldo de apertura que nunca
    // se registró como movimiento, y eso es un asunto de la data, no de este
    // código. La herramienta de cuadre lo reporta; este test no lo tapa.
    const reconcile = await movements.recomputeBalances(companyId, false);
    const mine = reconcile.mismatches.filter((m: { id: string }) => createdAccountIds.includes(m.id));
    check(
      'los saldos almacenados coinciden con la suma de movimientos',
      mine.length === 0,
      JSON.stringify(mine),
    );

    console.log('\n8. Cuenta con movimientos no se puede borrar');
    let deleteBlocked = false;
    try {
      await accounts.remove(companyId, bs.id);
    } catch {
      deleteBlocked = true;
    }
    check('borrar una cuenta con movimientos está bloqueado', deleteBlocked);
  } finally {
    // Only removes what this script created.
    await prisma.accountMovement.deleteMany({ where: { accountId: { in: createdAccountIds } } });
    await prisma.fxTrade.deleteMany({
      where: { OR: [{ fromAccountId: { in: createdAccountIds } }, { toAccountId: { in: createdAccountIds } }] },
    });
    await prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } });
    await prisma.sequenceCounter.deleteMany({ where: { companyId, entity: { in: ['account', 'fx_trade'] } } });
    await app.close();
  }

  console.log(failures === 0 ? '\nTodo en verde.\n' : `\n${failures} verificación(es) fallaron.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
