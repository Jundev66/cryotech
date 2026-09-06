import { test, expect } from '@playwright/test';
import { chooseOption, fixture, readApi } from './fixtures';

/**
 * Alimento: la fórmula dice cuánto debería comer el lote, el consumo dice
 * cuánto comió de verdad.
 *
 * Lo que se cuida es que registrar un consumo **baje el inventario**. Si no lo
 * hace, el galpón tiene sacos en el sistema que ya no existen, y el costo por
 * kilo —que es el número por el que existe todo esto— sale mal.
 */
test.describe.serial('Alimento', () => {
  const GRAMS_PER_BIRD = 120;
  const CONSUMED_KG = 4;

  test('crear una fórmula para la raza del lote', async ({ page }) => {
    await page.goto('/dashboard/feed');
    await expect(page.getByRole('heading', { name: /Formulas|Fórmulas/ })).toBeVisible();

    await page.getByTestId('new-formula').click();
    await chooseOption(page, 'formula-breed', 'Cobb 500');
    await page.getByLabel('Semana').fill('5');
    await page.getByLabel('Gramos / ave / dia').fill(String(GRAMS_PER_BIRD));
    await page.getByRole('button', { name: 'Crear formula' }).click();

    await expect(page.getByRole('cell', { name: String(GRAMS_PER_BIRD) }).first()).toBeVisible();
  });

  test('un consumo descuenta del inventario', async ({ page }) => {
    const data = fixture();

    // Hace falta que haya alimento en el galpón para poder consumirlo.
    const stockBefore = await stockOf(data.feedProductId);
    test.skip(stockBefore < CONSUMED_KG, 'no hay alimento en inventario para consumir');

    await page.goto('/dashboard/consumptions');
    await page.getByTestId('new-consumption').click();
    await chooseOption(page, 'consumption-batch', /Cobb 500/);
    await chooseOption(page, 'consumption-product', new RegExp(data.feedProductName));
    await page.getByLabel('Cantidad (kg)').fill(String(CONSUMED_KG));
    await page.getByRole('button', { name: 'Registrar Consumo' }).click();

    await expect(page.getByText('Consumo registrado')).toBeVisible();

    // Registrarlo lo deja pendiente; el saco sigue en el galpón hasta que se
    // aprueba. Esa segunda mano es lo que permite corregir la cantidad antes de
    // que toque el inventario.
    expect(await stockOf(data.feedProductId)).toBe(stockBefore);

    // Esperar a que el botón desaparezca, no a que aparezca "Confirmado": ese
    // texto ya está en las pestañas del filtro, así que la aserción pasaría
    // antes de que el servidor descontara nada.
    await page.getByRole('button', { name: 'Aprobar' }).first().click();
    await expect(page.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);

    expect(await stockOf(data.feedProductId)).toBe(stockBefore - CONSUMED_KG);
  });

  test('no deja consumir más de lo que hay', async ({ page }) => {
    const data = fixture();
    const stock = await stockOf(data.feedProductId);

    await page.goto('/dashboard/consumptions');
    await page.getByTestId('new-consumption').click();
    await chooseOption(page, 'consumption-batch', /Cobb 500/);
    await chooseOption(page, 'consumption-product', new RegExp(data.feedProductName));
    // Un día distinto: uno por lote y por día.
    await page.getByLabel('Fecha de Consumo').fill(daysAgo(1));
    await page.getByLabel('Cantidad (kg)').fill(String(stock + 100));
    await page.getByRole('button', { name: 'Registrar Consumo' }).click();

    await page.getByRole('button', { name: 'Aprobar' }).first().click();
    await expect(page.getByText(/Stock insuficiente/i)).toBeVisible();
    expect(await stockOf(data.feedProductId)).toBe(stock);
  });
});

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function stockOf(productId: string): Promise<number> {
  const products = await readApi<Array<{ id: string; currentStock: string }>>('/products');
  return Number(products.find((p) => p.id === productId)?.currentStock ?? 0);
}
