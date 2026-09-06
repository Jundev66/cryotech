/**
 * Read-only check of the collection queries against real data.
 *
 * The one that matters: the per-client breakdown must add up to the aggregate
 * receivables figure the cash flow already reports. If those two disagree,
 * one of them is lying and you would not know which.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-receivables.ts <companyId>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/modules/reports/reports.service';
import { TransactionsService } from '../src/modules/transactions/transactions.service';
import { targetCompany } from './lib/test-company';

const MARKER = 'ZZ-RECV';
import { PrismaService } from '../src/prisma/prisma.service';

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
  const reports = app.get(ReportsService);
  const transactions = app.get(TransactionsService);
  const prisma = app.get(PrismaService);

  const made = { warehouseId: null as string | null, batchId: null as string | null, clientIds: [] as string[] };

  try {
    // Deudas propias, en vez de confiar en que la empresa tenga alguna: contra
    // una empresa de pruebas limpia, medio archivo se saltaba en silencio y
    // decía "todo en verde" sin haber comprobado nada del estado de cuenta.
    const warehouse = await prisma.warehouse.create({
      data: { companyId, name: `${MARKER} Galpón`, capacity: 100 },
    });
    made.warehouseId = warehouse.id;

    const batch = await prisma.batch.create({
      data: {
        companyId,
        code: `${MARKER}-LOT`,
        warehouseId: warehouse.id,
        breed: 'Cobb 500',
        initialQuantity: 60,
        currentQuantity: 60,
        status: 'for_sale',
      },
    });
    made.batchId = batch.id;

    const debtor = await prisma.client.create({
      data: { companyId, code: `${MARKER}-CLI`, name: `${MARKER} Deudor` },
    });
    made.clientIds.push(debtor.id);

    // Una fiada al día y otra ya vencida, que son los dos casos del reporte.
    const daysAgo = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date;
    };

    await prisma.sale.createMany({
      data: [
        {
          companyId, batchId: batch.id, clientId: debtor.id, code: `${MARKER}-V1`,
          saleType: 'live', quantity: 5, weightKg: 12, totalAmount: 48, paidAmount: 0,
          paymentStatus: 'pending', saleDate: daysAgo(3),
        },
        {
          companyId, batchId: batch.id, clientId: debtor.id, code: `${MARKER}-V2`,
          saleType: 'live', quantity: 4, weightKg: 10, totalAmount: 40, paidAmount: 15,
          paymentStatus: 'partial', saleDate: daysAgo(20), dueDate: daysAgo(6),
        },
      ],
    });

    console.log('\n1. Deudores por cliente');
    const receivables = await reports.getReceivablesByClient(companyId);
    const cashFlow = await transactions.getCashFlow(companyId);

    console.log(`   ${receivables.totals.clientsCount} clientes deben $${receivables.totals.owedUsd}`);
    console.log(`   ${receivables.totals.unpaidKg} kg sin pagar`);

    check(
      'el desglose cuadra con el total del flujo de caja',
      Math.abs(receivables.totals.owedUsd - cashFlow.receivables.usd) < 0.02,
      `desglose ${receivables.totals.owedUsd} vs flujo ${cashFlow.receivables.usd}`,
    );
    check(
      'todos los deudores tienen saldo positivo',
      receivables.clients.every((c) => c.owedUsd > 0),
    );
    check(
      'vienen ordenados por monto',
      receivables.clients.every((c, i, arr) => i === 0 || arr[i - 1].owedUsd >= c.owedUsd),
    );
    check('trae la conversión a bolívares', receivables.clients.every((c) => c.owedBs !== null));

    console.log('\n   Los que más deben:');
    for (const client of receivables.clients.slice(0, 5)) {
      console.log(
        `     ${client.clientName.padEnd(22)} $${String(client.owedUsd).padStart(9)} · ` +
          `${client.unpaidKg} kg · ${client.salesCount} venta(s) · más vieja hace ${client.daysSinceOldest}d` +
          (client.overdueCount > 0 ? ` · ${client.overdueCount} vencida(s)` : ''),
      );
    }

    console.log('\n2. Estado de cuenta');
    const withDebt = receivables.clients.find((c) => c.clientId !== null);
    if (!withDebt?.clientId) {
      console.log('   (no hay clientes con deuda para probar)');
    } else {
      const statement = await reports.getClientStatement(companyId, withDebt.clientId);
      console.log(`   ${statement.client.name}: vendido $${statement.totals.sold}, pagado $${statement.totals.paid}, debe $${statement.totals.balance}`);

      check(
        'el saldo coincide con el desglose de deudores',
        Math.abs(statement.totals.balance - withDebt.owedUsd) < 0.02,
        `${statement.totals.balance} vs ${withDebt.owedUsd}`,
      );
      check(
        'vendido menos pagado es igual al saldo',
        Math.abs(statement.totals.sold - statement.totals.paid - statement.totals.balance) < 0.02,
      );
      check(
        'cada venta cuadra individualmente',
        statement.sales.every((s) => Math.abs(s.totalAmount - s.paidAmount - s.balance) < 0.02),
      );
      check(
        'los kilos sin pagar no superan los vendidos',
        statement.totals.unpaidKg <=
          statement.sales.reduce((sum, s) => sum + (s.weightKg ?? 0), 0) + 0.01,
      );

      console.log('\n   Ventas abiertas:');
      for (const sale of statement.sales.filter((s) => s.balance > 0).slice(0, 5)) {
        console.log(
          `     ${(sale.code ?? '—').padEnd(14)} ${sale.saleDate} · ` +
            `${sale.weightKg ?? '—'} kg · $${sale.totalAmount} · abonado $${sale.paidAmount} · debe $${sale.balance}` +
            (sale.isOverdue ? ' · VENCIDA' : ''),
        );
      }
    }

    console.log('\n3. Ventas vencidas');
    const overdue = await reports.getOverdueSales(companyId);
    console.log(`   ${overdue.length} venta(s) vencida(s)`);
    check('todas tienen saldo', overdue.every((s) => s.balance > 0));
    check('todas están efectivamente vencidas', overdue.every((s) => s.daysOverdue > 0));
    check(
      'ordenadas por antigüedad',
      overdue.every((s, i, arr) => i === 0 || arr[i - 1].daysOverdue >= s.daysOverdue),
    );
    for (const sale of overdue.slice(0, 5)) {
      console.log(
        `     ${sale.clientName.padEnd(22)} $${sale.balance} · vencida hace ${sale.daysOverdue}d (${sale.dueDate})`,
      );
    }
  } finally {
    console.log('\nLimpiando...');
    if (made.batchId) {
      await prisma.sale.deleteMany({ where: { batchId: made.batchId } });
      await prisma.batch.deleteMany({ where: { id: made.batchId } });
    }
    if (made.clientIds.length > 0) {
      await prisma.client.deleteMany({ where: { id: { in: made.clientIds } } });
    }
    if (made.warehouseId) await prisma.warehouse.deleteMany({ where: { id: made.warehouseId } });
    await app.close();
  }

  console.log(failures === 0 ? '\nTodo en verde.\n' : `\n${failures} verificación(es) fallaron.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
