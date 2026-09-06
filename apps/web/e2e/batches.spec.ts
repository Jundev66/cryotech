import { test, expect } from '@playwright/test';
import { chooseOption, expenses, fixture, readApi } from './fixtures';

/**
 * El ciclo de vida del lote, que es donde nace el gasto de la crianza.
 *
 * Planificar lo deja en papel; confirmarlo es lo que mueve inventario y dinero.
 * Ese paso llegó a duplicar la entrada de los pollitos —subiendo el stock dos
 * veces y reconociendo el gasto dos veces— así que lo que se cuida aquí no es
 * que el formulario abra, sino que confirmar sume **una sola vez**.
 */
test.describe.serial('Lotes', () => {
  const CHICKS = 120;
  const PRICE_PER_CHICK = 15;
  const BREED = 'Ross 308';

  test('planificar un lote con sus pollitos', async ({ page }) => {
    const data = fixture();

    await page.goto('/dashboard/batches');
    await expect(page.getByRole('heading', { name: 'Lotes' })).toBeVisible();

    await page.getByTestId('new-batch').click();
    await chooseOption(page, 'batch-warehouse', /Galpón E2E/);
    await chooseOption(page, 'batch-breed', BREED);
    await page.getByTestId('batch-quantity').fill(String(CHICKS));

    // El insumo es lo que convierte el plan en una compra al confirmarlo. Sin
    // esta línea el lote nace sin costo y el paso siguiente no probaría nada.
    await page.getByRole('button', { name: /Agregar insumo/i }).click();
    await chooseOption(page, 'line-product', data.chickProductName);
    await page.getByTestId('line-quantity').fill(String(CHICKS));
    await page.getByTestId('line-cost').fill(String(PRICE_PER_CHICK));

    await page.getByTestId('submit-batch').click();

    const row = page.getByTestId('batch-row').filter({ hasText: BREED });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Planificado');
    await expect(row.getByTestId('batch-row-quantity')).toHaveText(String(CHICKS));

    // Planificar no toca nada todavía: el pollito no ha entrado al galpón.
    // `currentStock` viaja como texto: es un Decimal de Prisma.
    const products = await readApi<Array<{ id: string; currentStock: string }>>('/products');
    expect(Number(products.find((p) => p.id === data.chickProductId)?.currentStock)).toBe(0);
  });

  test('confirmarlo reconoce el gasto de los pollitos una sola vez', async ({ page }) => {
    await page.goto('/dashboard/batches');
    await page
      .getByTestId('batch-row')
      .filter({ hasText: BREED })
      .getByRole('link', { name: /Ver/ })
      .click();

    await expect(page.getByRole('heading', { name: BREED })).toBeVisible();
    const before = await expenses();

    // Esperar a que el botón desaparezca, no a que se vea "En Crianza": ese
    // texto ya está en el propio botón, así que la aserción pasaría al instante
    // y leeríamos los libros antes de que el servidor terminara.
    await page.getByRole('button', { name: /Cambiar a En Crianza/i }).click();
    await expect(page.getByRole('button', { name: /Cambiar a En Crianza/i })).toHaveCount(0);

    const data = fixture();
    const after = await expenses();
    const created = after.filter((e) => !before.some((b) => b.code === e.code));

    expect(
      created.length,
      `gastos nuevos: ${created.map((e) => `${e.code} ${e.amount}`).join(', ') || 'ninguno'}`,
    ).toBe(1);
    expect(created[0].amount).toBe(CHICKS * PRICE_PER_CHICK);
    // Su propia categoría, no "Otros": comprar las aves es la mitad de lo que
    // cuesta criar un lote y tiene que verse aparte en los reportes.
    expect(created[0].category).toBe('chicks');

    // Y el stock subió una sola vez, no dos.
    const products = await readApi<Array<{ id: string; currentStock: string }>>('/products');
    expect(Number(products.find((p) => p.id === data.chickProductId)?.currentStock)).toBe(CHICKS);

  });

  test('pasar a venta no vuelve a cobrar nada', async ({ page }) => {
    await page.goto('/dashboard/batches');
    await page
      .getByTestId('batch-row')
      .filter({ hasText: BREED })
      .getByRole('link', { name: /Ver/ })
      .click();

    const before = await expenses();
    await page.getByRole('button', { name: /Cambiar a En Venta/i }).click();
    await expect(page.getByRole('button', { name: /Cambiar a En Venta/i })).toHaveCount(0);

    expect((await expenses()).length).toBe(before.length);
  });
});
