import { test, expect, type APIRequestContext } from '@playwright/test';
import { chooseOption, fixture, readApi } from './fixtures';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3011/api';

interface ApiSale {
  code: string | null;
  batchId: string;
  clientId: string | null;
  quantity: number;
}

interface ApiBatch {
  id: string;
  currentQuantity: number;
}

async function batchQuantity(batchId: string): Promise<number> {
  const batches = await readApi<ApiBatch[]>('/batches');
  return batches.find((batch) => batch.id === batchId)?.currentQuantity ?? -1;
}

async function salesOf(batchId: string): Promise<ApiSale[]> {
  const sales = await readApi<ApiSale[]>('/sales');
  return sales.filter((sale) => sale.batchId === batchId);
}

function postBulk(
  request: APIRequestContext,
  data: ReturnType<typeof fixture>,
  items: Array<Record<string, unknown>>,
) {
  return request.post(`${API_URL}/sales/bulk`, {
    headers: {
      Authorization: `Bearer ${data.accessToken}`,
      'X-Company-Id': data.companyId,
    },
    data: { batchId: data.batchId, items },
  });
}

/**
 * Despachar un lote entre varios compradores en una sola pasada.
 *
 * Lo que de verdad se prueba es la segunda prueba, no la primera. Registrar
 * tres ventas juntas es cómodo; lo que no puede pasar es que tres ventas que
 * individualmente caben en el lote lo sobregiren entre todas. Un bucle de
 * `POST /sales` pasa ese caso porque cada llamada valida contra la cantidad que
 * leyó antes de empezar, y ninguna ve a las otras.
 *
 * Corre sobre el lote compartido a propósito. Un lote propio sería lo habitual
 * aquí, pero solo hay cuatro razas y las cuatro ya las elige algún spec por su
 * nombre, así que un quinto lote vuelve ambiguo el desplegable de otro. Es
 * seguro porque las tres primeras pruebas no escriben nada y la cuarta gasta 45
 * de 300 aves, y porque los sobregiros se calculan contra la cantidad que se
 * lee en ese momento, no contra un número fijo.
 *
 * Ojo al orden alfabético: corre **antes** que `sales.spec.ts`, que cuenta
 * exactamente una venta parcial y espera la pestaña "Pagados" vacía. Las ventas
 * de una tanda nacen `pending` y ninguna se cobra aquí — **no registrar cobros
 * en este spec** o esas dos aserciones se caen sin que el bug esté en ellas.
 */
test.describe.serial('Ventas multiples', () => {
  const PRICE_PER_KG = 4;

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/sales');
    await expect(page.getByRole('heading', { name: 'Ventas' })).toBeVisible();
  });

  test('el lote no se sobregira aunque cada fila quepa por separado', async ({ page }) => {
    const data = fixture();
    const before = await batchQuantity(data.batchId);
    const salesBefore = (await salesOf(data.batchId)).length;

    await page.getByTestId('new-bulk-sale').click();
    await chooseOption(page, 'bulk-batch', new RegExp(data.batchCode));

    // Dos filas que caben una a una y no caben juntas: 60 + 60 contra 100.
    const half = Math.floor(before / 2) + 10;
    await chooseOption(page, 'bulk-client-0', data.clientName);
    await page.getByTestId('bulk-quantity-0').fill(String(half));
    await page.getByTestId('bulk-weight-0').fill('120');
    await page.getByTestId('bulk-price-0').fill(String(PRICE_PER_KG));

    await page.getByTestId('bulk-add-row').click();
    await chooseOption(page, 'bulk-client-1', data.clientName);
    await page.getByTestId('bulk-quantity-1').fill(String(half));
    await page.getByTestId('bulk-weight-1').fill('120');
    await page.getByTestId('bulk-price-1').fill(String(PRICE_PER_KG));

    // La pantalla lo dice antes de enviar y no deja pulsar.
    await expect(page.getByTestId('bulk-remaining')).toContainText('Faltan');
    await expect(page.getByTestId('submit-bulk-sales')).toBeDisabled();

    // Y los libros no se movieron ni un ave.
    expect(await batchQuantity(data.batchId)).toBe(before);
    expect((await salesOf(data.batchId)).length).toBe(salesBefore);
  });

  /**
   * El botón deshabilitado es cortesía; esto es la garantía.
   *
   * Contra la API directamente, porque el sobregiro que importa no lo comete un
   * usuario despistado sino un cliente que no pasa por la pantalla — y porque
   * es exactamente lo que hacía un bucle de `POST /sales`.
   */
  test('la API rechaza la tanda que sobregira, sin escribir nada', async ({ request }) => {
    const data = fixture();
    const before = await batchQuantity(data.batchId);
    const salesBefore = (await salesOf(data.batchId)).length;

    const half = Math.floor(before / 2) + 10;
    const response = await postBulk(request, data, [
      { clientId: data.clientId, saleType: 'live', quantity: half, totalAmount: 100 },
      { clientId: data.clientId, saleType: 'live', quantity: half, totalAmount: 100 },
    ]);

    expect(response.status(), 'la tanda que no cabe se rechaza').toBe(400);
    const body = await response.json();
    expect(String(body.message)).toContain('suman');

    // Nada a medias: ni ventas ni aves descontadas.
    expect(await batchQuantity(data.batchId)).toBe(before);
    expect((await salesOf(data.batchId)).length).toBe(salesBefore);
  });

  /** Una fila con un cliente ajeno tumba la tanda entera, no solo esa fila. */
  test('un cliente de otra empresa cancela toda la tanda', async ({ request }) => {
    const data = fixture();
    const before = await batchQuantity(data.batchId);
    const salesBefore = (await salesOf(data.batchId)).length;

    const response = await postBulk(request, data, [
      { clientId: data.clientId, saleType: 'live', quantity: 1, totalAmount: 4 },
      // UUID válido que no es de esta empresa.
      { clientId: '00000000-0000-4000-8000-000000000000', saleType: 'live', quantity: 1, totalAmount: 4 },
    ]);

    expect(response.status()).toBe(404);
    expect(await batchQuantity(data.batchId)).toBe(before);
    expect((await salesOf(data.batchId)).length).toBe(salesBefore);
  });

  test('tres ventas de un lote se registran de una sola pasada', async ({ page }) => {
    const data = fixture();
    const before = await batchQuantity(data.batchId);
    const codesBefore = new Set((await salesOf(data.batchId)).map((sale) => sale.code));

    const rows = [
      { quantity: 20, weight: 48 },
      { quantity: 15, weight: 36 },
      { quantity: 10, weight: 24 },
    ];
    const totalBirds = rows.reduce((sum, row) => sum + row.quantity, 0);
    const grandTotal = rows.reduce((sum, row) => sum + row.weight * PRICE_PER_KG, 0);

    await page.getByTestId('new-bulk-sale').click();
    await chooseOption(page, 'bulk-batch', new RegExp(data.batchCode));

    for (const [index, row] of rows.entries()) {
      if (index > 0) await page.getByTestId('bulk-add-row').click();
      await chooseOption(page, `bulk-client-${index}`, data.clientName);
      await page.getByTestId(`bulk-quantity-${index}`).fill(String(row.quantity));
      await page.getByTestId(`bulk-weight-${index}`).fill(String(row.weight));
      await page.getByTestId(`bulk-price-${index}`).fill(String(PRICE_PER_KG));
      // El total se calcula al salir del campo, no al enviar.
      await page.getByTestId(`bulk-price-${index}`).blur();
    }

    await expect(page.getByTestId('bulk-total-quantity')).toContainText(String(totalBirds));
    await expect(page.getByTestId('bulk-grand-total')).toContainText(String(grandTotal));

    await page.getByTestId('submit-bulk-sales').click();
    await expect(page.getByText('3 ventas registradas')).toBeVisible();

    // El lote bajó por la suma exacta, una sola vez.
    expect(await batchQuantity(data.batchId)).toBe(before - totalBirds);

    // Y los tres códigos son consecutivos: la secuencia se reservó de un tirón.
    const created = (await salesOf(data.batchId))
      .filter((sale) => !codesBefore.has(sale.code))
      .map((sale) => Number(sale.code?.split('-')[1]))
      .sort((a, b) => a - b);

    expect(created).toHaveLength(3);
    expect(created[1]).toBe(created[0] + 1);
    expect(created[2]).toBe(created[1] + 1);
  });
});
