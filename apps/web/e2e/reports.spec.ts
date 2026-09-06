import { test, expect } from '@playwright/test';
import { readApi } from './fixtures';

/**
 * Los reportes son de solo lectura, así que lo que hay que probar no es que
 * abran sino que **digan lo mismo que los libros**.
 *
 * Cada test lee primero la API y después exige que la pantalla concuerde. Así
 * el test sirve con la granja llena y con la granja vacía: "Sin datos" es la
 * respuesta correcta cuando de verdad no hay datos, y es una mentira cuando sí
 * los hay. Un test que solo comprobara que la página carga daría verde en los
 * dos casos.
 */
test.describe('Reportes', () => {
  test('la rentabilidad por lote concuerda con los libros', async ({ page }) => {
    const profitability = await readApi<Array<{ batchId: string; breed?: string }>>(
      '/reports/batch-profitability',
    );

    await page.goto('/dashboard/reports');
    await expect(page.getByRole('heading', { name: /Reportes/ })).toBeVisible();

    const card = page.getByText('Rentabilidad por Lote').locator('xpath=ancestor::div[1]/..');

    if (profitability.length === 0) {
      await expect(card).toContainText('Sin datos');
      return;
    }

    await expect(card).not.toContainText('Sin datos');
    const batches = await readApi<Array<{ id: string; breed: string }>>('/batches');
    const shown = batches.find((b) => b.id === profitability[0].batchId);
    if (shown) await expect(card).toContainText(shown.breed);
  });

  test('el ranking de lotes concuerda con los libros', async ({ page }) => {
    const top = await readApi<Array<{ id: string; breed: string; totalRevenue: number }>>(
      '/reports/top-batches',
    );

    await page.goto('/dashboard/reports');
    const card = page.getByText('Mejores Lotes').locator('xpath=ancestor::div[1]/..');

    if (top.length === 0) {
      await expect(card).toContainText('Sin datos');
      return;
    }

    await expect(card).not.toContainText('Sin datos');
    await expect(card).toContainText(top[0].breed);
  });

  test('ingresos vs gastos suma lo que hay en finanzas', async ({ page }) => {
    const [series, transactions] = await Promise.all([
      readApi<Array<{ month: string; income: number; expense: number }>>('/reports/revenue-expense'),
      readApi<Array<{ type: string; amount: string }>>('/transactions'),
    ]);

    const fromReport = series.reduce((sum, month) => sum + Number(month.expense), 0);
    const fromBooks = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // El reporte agrupa por mes los últimos doce; si la suite corrió hoy, todo
    // cae dentro de esa ventana y las dos cifras tienen que coincidir.
    expect(Math.round(fromReport * 100) / 100).toBe(Math.round(fromBooks * 100) / 100);

    await page.goto('/dashboard/reports');
    await expect(page.getByText('Ingresos vs Gastos')).toBeVisible();
  });
});
