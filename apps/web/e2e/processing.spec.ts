import { test, expect } from '@playwright/test';
import { chooseOption, expenses, fixture, parseAmount, readApi } from './fixtures';

/**
 * Beneficiar saca aves del lote, las mete a stock procesado y reconoce el costo.
 *
 * Aquí vive la trampa que ya costó dinero: el costo de un beneficio se guarda
 * en **dólares** en `totalCost` y en bolívares en `totalCostBs`, al revés que
 * una compra. Leer el equivocado deja la cifra dividida por la tasa —unas 757
 * veces menos— y eso fue exactamente lo que la pantalla mostraba, un beneficio
 * de Bs 2.450 rotulado "Bs 3,23".
 */
test.describe.serial('Beneficio', () => {
  const BIRDS = 7;
  const COST_USD = 3.5;

  test('beneficiar saca las aves del lote y reconoce el costo en bolívares', async ({ page }) => {
    const data = fixture();

    const birdsBefore = await batchQuantity(data.processingBatchId);
    const expensesBefore = await expenses();

    await page.goto('/dashboard/processing');
    await expect(page.getByRole('heading', { name: /Beneficio/ })).toBeVisible();

    await page.getByTestId('new-processing').click();
    await chooseOption(page, 'processing-batch', /Otro/);
    await page.getByTestId('processing-quantity').fill(String(BIRDS));
    await page.getByTestId('processing-total-cost').fill(String(COST_USD));
    await page.getByTestId('submit-processing').click();

    // Por su código, no por ser la primera: otros specs también benefician.
    const row = page.getByTestId('processing-row').filter({ hasText: 'Otro' }).first();
    await expect(row).toBeVisible();

    await test.step('las aves salieron del lote', async () => {
      expect(await batchQuantity(data.processingBatchId)).toBe(birdsBefore - BIRDS);
    });

    const processing = await test.step('el costo quedó en bolívares', async () => {
      const all = await readApi<
        Array<{ id: string; batchId: string; totalCost: string; totalCostBs: string | null; exchangeRate: string | null }>
      >('/processing');
      const created = all.find((one) => one.batchId === data.processingBatchId)!;

      // Se escribió $3,50 y el sistema tiene que haber guardado los bolívares
      // que eso vale hoy — si no, el beneficio queda impagable.
      expect(Number(created.totalCost)).toBe(COST_USD);
      expect(Number(created.totalCostBs)).toBeGreaterThan(COST_USD * 100);
      return created;
    });

    await test.step('la pantalla muestra bolívares, no dólares', async () => {
      // Antes decía "Bs 3,50" para un beneficio que costó miles.
      const shown = parseAmount(await row.getByTestId('processing-cost').innerText());
      expect(shown).toBe(Number(processing.totalCostBs));
    });

    await test.step('el gasto en los libros también', async () => {
      const created = (await expenses()).filter((e) => !expensesBefore.some((b) => b.code === e.code));
      expect(created.length, 'beneficiar reconoce un gasto, no dos').toBe(1);
      expect(created[0].amount).toBe(Number(processing.totalCostBs));
      expect(created[0].category).toBe('processing');
    });
  });

  test('queda pendiente de pago y se paga sin reconocer otro gasto', async ({ page }) => {
    const data = fixture();
    await page.goto('/dashboard/processing');

    const row = page.getByTestId('processing-row').filter({ hasText: 'Otro' }).first();
    await expect(row).toContainText('Pendiente');

    const owed = parseAmount(await row.getByTestId('processing-balance').innerText());
    expect(owed).toBeGreaterThan(0);

    const expensesBefore = await expenses();
    const balanceBefore = await accountBalance(data.accountId);

    await row.getByTestId('pay-processing').click();
    await expect(page.getByTestId('payable-payment-dialog')).toBeVisible();
    await page.getByTestId('payable-amount').fill(String(owed));
    await chooseOption(page, 'payable-account', new RegExp(data.accountName));
    await page.getByTestId('submit-payable-payment').click();

    await expect(page.getByText('Pago registrado')).toBeVisible();
    await expect(row).toContainText('Pagado');

    // Lo que salió mal con Carmen: pagar volvía a reconocer el gasto.
    expect((await expenses()).length).toBe(expensesBefore.length);
    expect(await accountBalance(data.accountId)).toBe(Math.round((balanceBefore - owed) * 100) / 100);

    // Y ya no hay nada más que pagar.
    await expect(row.getByTestId('pay-processing')).toHaveCount(0);
  });
});

async function batchQuantity(batchId: string): Promise<number> {
  const batches = await readApi<Array<{ id: string; currentQuantity: number }>>('/batches');
  return Number(batches.find((b) => b.id === batchId)?.currentQuantity ?? 0);
}

async function accountBalance(accountId: string): Promise<number> {
  const accounts = await readApi<Array<{ id: string; currentBalance: string }>>('/treasury/accounts');
  return Number(accounts.find((a) => a.id === accountId)?.currentBalance ?? 0);
}
