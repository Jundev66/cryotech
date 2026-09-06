import type { INestApplicationContext } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CompaniesService } from '../../src/modules/companies/companies.service';
import { AccountsService } from '../../src/modules/treasury/accounts.service';

export const TEST_COMPANY_NAME = 'ZZ Empresa de Pruebas';
const TEST_USER_EMAIL = 'zz-pruebas@cryotech.test';

/**
 * Made-up identifiers, but they must match the ones printed on the synthetic
 * receipts in `test/fixtures` digit for digit: without an account that resolves
 * them, the reader cannot tell whether money came in or out. Change one, change
 * the image too.
 *
 * They can repeat across companies because the unique index is per company — it
 * used to be global, and a second farm with a card ending in 5678 hit a
 * conflict.
 */
const BANK_ACCOUNT = {
  name: 'BDV Bs',
  kind: 'bank' as const,
  currency: 'VES' as const,
  isActive: true,
  identifiers: [
    { kind: 'last4' as const, value: '5678', bankCode: '0102' },
    { kind: 'phone' as const, value: '04120000000' },
    { kind: 'phone' as const, value: '04160000000' },
  ],
};

/**
 * La empresa contra la que corren las suites de verificación.
 *
 * Existía una sola razón para correrlas contra la empresa real —que los
 * identificadores de las cuentas resolvieran— y salió cara: la numeración de
 * ventas saltó cincuenta números, el inventario de beneficiados subió de 83 a
 * 119 y el saldo del BDV terminó siendo un residuo aritmético de dos corridas
 * que se cayeron. Nada de eso era la prueba fallando; era la prueba escribiendo
 * donde no debía.
 *
 * Se crea una vez y se reutiliza. Va por los servicios y no con INSERT porque
 * crear una empresa no es una fila: `CompaniesService.create` siembra los roles,
 * las unidades de medida y las categorías de producto, y sin eso media
 * aplicación se rompe de formas que parecen bugs.
 */
export async function resolveTestCompany(app: INestApplicationContext): Promise<string> {
  const prisma = app.get(PrismaService);

  const existing = await prisma.company.findFirst({
    where: { name: TEST_COMPANY_NAME },
    select: { id: true },
  });
  if (existing) return existing.id;

  const user =
    (await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } })) ??
    (await prisma.user.create({
      data: {
        email: TEST_USER_EMAIL,
        // No se usa para entrar: las suites llaman a los servicios, no a la API.
        passwordHash: 'sin-login',
        fullName: 'Pruebas automatizadas',
      },
    }));

  const company = await app.get(CompaniesService).create(user.id, {
    name: TEST_COMPANY_NAME,
  } as never);

  await app.get(AccountsService).create(company.id, BANK_ACCOUNT as never);

  console.log(`  (creada ${TEST_COMPANY_NAME})`);
  return company.id;
}

/**
 * El companyId contra el que correr: el que venga por argumento, o el de
 * pruebas.
 *
 * Pasar uno a mano sigue sirviendo para reproducir algo contra datos reales,
 * pero deja de ser lo que pasa por defecto.
 */
export async function targetCompany(
  app: INestApplicationContext,
  argument: string | undefined,
): Promise<string> {
  if (argument && argument !== '--test-company') return argument;
  return resolveTestCompany(app);
}
