import { test, expect } from '@playwright/test';
import { chooseOption, fixture, readApi } from './fixtures';

/**
 * Vender pollo beneficiado, que es como termina cada ciclo.
 *
 * Cuando el último pollo sale del galpón el lote queda en cero, pero la nevera
 * está llena — y eso es justo cuando más se vende. El asistente de WhatsApp
 * cerraba la venta entera en ese momento ("no tienes lotes con aves
 * disponibles") porque buscaba aves vivas; la web nunca tuvo un test que
 * cubriera el caso.
 *
 * Lo que se cuida: que el lote se pueda elegir aunque no tenga nada en pie, que
 * la venta salga del inventario de procesados y **no** del lote —esas aves ya
 * se descontaron al beneficiarlas— y que no se pueda vender más de lo que hay.
 */
test.describe.serial('Venta de beneficiado', () => {
  const BIRDS = 6;
  const COST_USD = 3;
  const SELL = 2;

  test('beneficiar deja el lote en cero y la nevera con pollo', async ({ page }) => {
    const data = fixture();

    await page.goto('/dashboard/batches');
    const liveBefore = await batchQuantity(data.processedBatchId);
    expect(liveBefore, 'el lote de prueba nace con aves').toBeGreaterThan(BIRDS);

    // Se beneficia todo lo que queda: el escenario real es el lote vacío.
    await page.goto('/dashboard/processing');
    await page.getByTestId('new-processing').click();
    await chooseOption(page, 'processing-batch', /Hubbard/);
    await page.getByTestId('processing-quantity').fill(String(liveBefore));
    await page.getByTestId('processing-total-cost').fill(String(COST_USD));
    await page.getByTestId('submit-processing').click();

    await expect(page.getByTestId('processing-row').first()).toBeVisible();

    expect(await batchQuantity(data.processedBatchId), 'el lote queda vacío').toBe(0);
    expect(await processedStock(), 'y la nevera con lo que salió').toBeGreaterThanOrEqual(liveBefore);
  });

  test('el lote en cero se sigue pudiendo elegir para vender beneficiado', async ({ page }) => {
    await page.goto('/dashboard/sales');
    await page.getByTestId('new-sale').click();

    // Sin esto la venta no existe: el lote no tiene aves vivas, y es el único.
    await page.getByTestId('sale-batch').click();
    await expect(page.getByRole('option', { name: /Hubbard/ })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('vender beneficiado descuenta de la nevera, no del lote', async ({ page }) => {
    const data = fixture();
    const stockBefore = await processedStock();

    await page.goto('/dashboard/sales');
    await page.getByTestId('new-sale').click();
    await chooseOption(page, 'sale-batch', /Hubbard/);
    await chooseOption(page, 'sale-client', data.clientName);
    await chooseOption(page, 'sale-type', 'Pollos Muertos');
    await page.getByTestId('sale-quantity').fill(String(SELL));
    await page.getByTestId('sale-weight').fill('5');
    await page.getByTestId('sale-price-kg').fill('4');
    await page.getByTestId('sale-total').fill('20');
    await page.getByTestId('submit-sale').click();

    await expect(page.getByText('Venta registrada')).toBeVisible();

    expect(await processedStock(), 'sale de la nevera').toBe(stockBefore - SELL);
    expect(await batchQuantity(data.processedBatchId), 'y el lote sigue en cero').toBe(0);
  });

  test('no deja vender más beneficiados de los que hay', async ({ page }) => {
    const data = fixture();
    const available = await processedStock();

    await page.goto('/dashboard/sales');
    await page.getByTestId('new-sale').click();
    await chooseOption(page, 'sale-batch', /Hubbard/);
    await chooseOption(page, 'sale-client', data.clientName);
    await chooseOption(page, 'sale-type', 'Pollos Muertos');
    await page.getByTestId('sale-quantity').fill(String(available + 50));
    await page.getByTestId('sale-weight').fill('100');
    await page.getByTestId('sale-price-kg').fill('4');
    await page.getByTestId('sale-total').fill('400');
    await page.getByTestId('submit-sale').click();

    // El mensaje del servidor, no un "Error al registrar venta" genérico: dice
    // cuántos hay, que es lo que el usuario necesita para corregir.
    await expect(page.getByText(/excede los pollos beneficiados en inventario/i)).toBeVisible();
    expect(await processedStock(), 'no se movió nada').toBe(available);
  });
});

async function batchQuantity(batchId: string): Promise<number> {
  const batches = await readApi<Array<{ id: string; currentQuantity: number }>>('/batches');
  return Number(batches.find((batch) => batch.id === batchId)?.currentQuantity ?? 0);
}

async function processedStock(): Promise<number> {
  const products = await readApi<Array<{ name: string; currentStock: number }>>('/products');
  return Number(products.find((product) => product.name === 'Pollo Beneficiado')?.currentStock ?? 0);
}
