import { test, expect } from '@playwright/test';
import { expectNoErrorState, fixture } from './fixtures';

/**
 * Every screen loads with a real company behind it.
 *
 * Cheap, but it catches the failure that is hardest to notice by hand: a screen
 * that breaks only on a company whose data is empty, or one whose query was
 * renamed and now 404s. A page that renders "Error al cargar" is a failure here
 * even though it technically rendered.
 */
const PAGES = [
  { path: '/dashboard', heading: /Dashboard|Resumen|Hola/i },
  { path: '/dashboard/batches', heading: /Lotes/i },
  { path: `/dashboard/batches/${fixture().batchId}`, heading: /Cobb 500/i },
  { path: '/dashboard/daily-logs', heading: /Registros? Diarios?/i },
  { path: '/dashboard/feed', heading: /Formulas|Fórmulas|Alimento/i },
  { path: '/dashboard/sales', heading: /Ventas/i },
  { path: '/dashboard/transactions', heading: /Finanzas|Transacciones/i },
  { path: '/dashboard/entries', heading: /Entradas|Compras/i },
  { path: '/dashboard/processing', heading: /Beneficio/i },
  { path: '/dashboard/clients', heading: /Clientes/i },
  { path: '/dashboard/products', heading: /Productos/i },
  { path: '/dashboard/warehouses', heading: /Galpones|Galpónes/i },
  { path: '/dashboard/treasury', heading: /Tesorer/i },
  { path: '/dashboard/reports', heading: /Reportes/i },
  { path: '/dashboard/users', heading: /Usuarios/i },
  { path: '/dashboard/settings', heading: /Configuraci/i },
];

test.describe('Navegación', () => {
  for (const { path, heading } of PAGES) {
    test(`${path} carga sin errores`, async ({ page }) => {
      const failures: string[] = [];
      page.on('response', (response) => {
        // 401 is the session expiring, 5xx is the server breaking. Both would
        // otherwise show up only as an empty table.
        if (response.url().includes('/api/') && response.status() >= 400) {
          failures.push(`${response.status()} ${response.url()}`);
        }
      });

      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      await expectNoErrorState(page);

      expect(failures, `respuestas con error en ${path}`).toEqual([]);
    });
  }

  test('la sesión guardada entra directo al dashboard', async ({ page }) => {
    await page.goto('/');
    // Not redirected to /login: storageState carries a live session.
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
