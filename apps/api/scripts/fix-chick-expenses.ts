/**
 * Moves the chick purchases out of "Otros" and into their own category.
 *
 * Buying the birds is roughly half of what a batch costs to raise, and until
 * `chicks` existed as an accounting category it all landed in `other` — the
 * second largest line on the books with no name of its own, mixed in with
 * whatever else had nowhere to go.
 *
 * Only touches expenses in `other` whose entry points at a product in the
 * chicks category, plus any whose description says so outright — the ones
 * inserted by hand before the entries module existed. Everything else in
 * `other` genuinely belongs there and is left alone.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/fix-chick-expenses.ts <companyId>          # simulación
 *   npx ts-node -P tsconfig.json --transpile-only scripts/fix-chick-expenses.ts <companyId> --apply
 */
import { PrismaClient } from '@prisma/client';
import { CHICKS_CATEGORY_SLUG } from '../src/common/constants/category-mapping';

const prisma = new PrismaClient();

/** Written by hand before entries existed, so there is no product to follow. */
const DESCRIPTION_HINT = /pollit|pollos?\s*beb/i;

async function main() {
  const companyId = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!companyId) {
    throw new Error('usage: fix-chick-expenses.ts <companyId> [--apply]');
  }

  const candidates = await prisma.transaction.findMany({
    where: { companyId, type: 'expense', category: 'other' },
    orderBy: { transactionDate: 'asc' },
  });

  // Which of them came from a purchase of a product in the chicks category.
  const entryIds = candidates
    .filter((transaction) => transaction.sourceType === 'entry' && transaction.sourceId)
    .map((transaction) => transaction.sourceId as string);

  const chickEntries = await prisma.productEntry.findMany({
    where: { id: { in: entryIds }, product: { category: { slug: CHICKS_CATEGORY_SLUG } } },
    select: { id: true },
  });
  const chickEntryIds = new Set(chickEntries.map((entry) => entry.id));

  const toMove = candidates.filter(
    (transaction) =>
      (transaction.sourceId && chickEntryIds.has(transaction.sourceId)) ||
      DESCRIPTION_HINT.test(transaction.description ?? ''),
  );

  if (toMove.length === 0) {
    console.log('No hay gastos de pollitos en "Otros".');
    return;
  }

  const total = toMove.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const staying = candidates.filter((transaction) => !toMove.includes(transaction));

  console.log(`\nPasan a "Pollos Bebé" (${toMove.length}):`);
  for (const transaction of toMove) {
    console.log(`  ${transaction.code?.padEnd(12) ?? '—'.padEnd(12)} Bs ${String(transaction.amount).padStart(10)}  ${transaction.description ?? ''}`);
  }
  console.log(`  ${''.padEnd(12)} Bs ${total.toFixed(2).padStart(10)}  total`);

  if (staying.length > 0) {
    console.log(`\nSe quedan en "Otros" (${staying.length}):`);
    for (const transaction of staying) {
      console.log(`  ${transaction.code?.padEnd(12) ?? '—'.padEnd(12)} Bs ${String(transaction.amount).padStart(10)}  ${transaction.description ?? ''}`);
    }
  }

  if (!apply) {
    console.log('\n(simulación — vuelve a correrlo con --apply para escribir)');
    return;
  }

  const updated = await prisma.transaction.updateMany({
    where: { id: { in: toMove.map((transaction) => transaction.id) } },
    data: { category: 'chicks' },
  });

  console.log(`\nReclasificadas ${updated.count}. Verificando...`);

  const after = await prisma.transaction.groupBy({
    by: ['category'],
    where: { companyId, type: 'expense' },
    _sum: { amount: true },
    _count: true,
  });
  for (const row of after.sort((a, b) => Number(b._sum.amount) - Number(a._sum.amount))) {
    console.log(`  ${row.category.padEnd(12)} Bs ${String(row._sum.amount).padStart(12)}  ${row._count}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
