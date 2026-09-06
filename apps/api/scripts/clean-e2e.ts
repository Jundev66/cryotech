/**
 * Removes the throwaway companies the Playwright suite creates.
 *
 * Every run builds a fresh one — a suite that reused a company would see the
 * previous run's sales and start failing on counts — so they pile up. This
 * clears them out.
 *
 * Deliberately not run automatically: the last run's data is what you read when
 * a test failed, and deleting it as a side effect of the next run would take
 * that away.
 *
 * Only touches companies whose name starts with "E2E " and users on
 * @cryotech.test. Never *Granja Mata*.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/clean-e2e.ts          # lista
 *   npx ts-node -P tsconfig.json --transpile-only scripts/clean-e2e.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const NAME_PREFIX = 'E2E ';
const EMAIL_DOMAIN = '@cryotech.test';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');

  const companies = await prisma.company.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const users = await prisma.user.findMany({
    where: { email: { endsWith: EMAIL_DOMAIN } },
    select: { id: true, email: true },
  });

  if (companies.length === 0 && users.length === 0) {
    console.log('No hay nada de E2E que limpiar.');
    return;
  }

  console.log(`\n${companies.length} empresa(s) de prueba:`);
  for (const company of companies) {
    console.log(`  ${company.name}  ${company.createdAt.toISOString().slice(0, 16).replace('T', ' ')}`);
  }
  console.log(`\n${users.length} usuario(s) ${EMAIL_DOMAIN}`);

  if (!apply) {
    console.log('\n(simulación — vuelve a correrlo con --apply para borrar)');
    return;
  }

  // Companies cascade to everything under them; users cascade to their
  // companies. Deleting the users last is what removes the empty shells.
  const deletedCompanies = await prisma.company.deleteMany({
    where: { id: { in: companies.map((c) => c.id) } },
  });

  // Solo los que ya no sostienen ninguna empresa. `zz-pruebas@cryotech.test`
  // también termina en @cryotech.test, pero es el dueño de "ZZ Empresa de
  // Pruebas" —que no se borra— y borrarlo reventaba contra la clave foránea,
  // dejando las empresas eliminadas pero el script en rojo.
  const orphaned = await prisma.user.findMany({
    where: {
      id: { in: users.map((u) => u.id) },
      ownedCompanies: { none: {} },
    },
    select: { id: true },
  });
  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { in: orphaned.map((u) => u.id) } },
  });

  console.log(
    `\nBorradas ${deletedCompanies.count} empresa(s) y ${deletedUsers.count} usuario(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
