import { test, expect } from '@playwright/test';
import { chooseOption, expenses, fixture, parseAmount, readApi } from './fixtures';

/**
 * Una compra tiene dos vidas separadas, y confundirlas es lo que rompió las
 * cuentas: **recibir** reconoce el gasto y mueve inventario, **pagar** mueve
 * plata. Comprar fiado y pagar por adelantado son las dos cosas normales.
 *
 * Lo que este spec cuida es que pagar no vuelva a reconocer el gasto — el error
 * que hizo que los Bs 2.450 de Carmen quedaran contados dos veces.
 */
test.describe.serial('Compras', () => {
  const SACKS = 10;
  const COST = 4000;
  const DELIVERY = 500;
  const TOTAL = COST + DELIVERY;
  const FIRST_PAYMENT = 1500;

  test('registrar una compra no mueve nada todavía', async ({ page }) => {
    const data = fixture();

    await page.goto('/dashboard/entries');
    await expect(page.getByRole('heading', { name: /Entradas/ })).toBeVisible();

    const expensesBefore = await expenses();
    const stockBefore = await stockOf(data.purchaseProductId);

    await page.getByTestId('new-entry').click();
    await chooseOption(page, 'entry-product', data.purchaseProductName);
    await page.getByTestId('entry-quantity').fill(String(SACKS));
    await page.getByTestId('entry-cost').fill(String(COST));
    await page.getByLabel('Incluir costo de envio').click();
    await page.getByLabel('Costo de Envio (Bs)').fill(String(DELIVERY));
    await page.getByTestId('submit-entry').click();

    const row = purchaseRow(page, data.purchaseProductName);
    await expect(row).toContainText('Pendiente');

    // Registrarla es papeleo: ni el saco entró al galpón ni el gasto existe.
    expect((await expenses()).length).toBe(expensesBefore.length);
    expect(await stockOf(data.purchaseProductId)).toBe(stockBefore);
  });

  test('recibirla sube el stock y reconoce el gasto una vez', async ({ page }) => {
    const data = fixture();
    await page.goto('/dashboard/entries');

    const before = await expenses();
    const stockBefore = await stockOf(data.purchaseProductId);
    const row = purchaseRow(page, data.purchaseProductName);
    await row.getByTestId('receive-entry').click();
    await expect(row).toContainText('Recibido');

    const created = (await expenses()).filter((e) => !before.some((b) => b.code === e.code));
    expect(created.length, 'recibir reconoce un gasto, no dos').toBe(1);
    // El flete es parte del costo de la mercancía, no un gasto aparte.
    expect(created[0].amount).toBe(TOTAL);

    expect(await stockOf(data.purchaseProductId)).toBe(stockBefore + SACKS);
  });

  test('pagarla mueve la caja y NO reconoce un segundo gasto', async ({ page }) => {
    const data = fixture();
    await page.goto('/dashboard/entries');

    const row = purchaseRow(page, data.purchaseProductName);
    await expect(row.getByTestId('entry-balance')).toBeVisible();
    // Con parseAmount, no con una expresión regular: en pantalla dice
    // "Bs 4.500,00", que no contiene la cadena "4500".
    expect(parseAmount(await row.getByTestId('entry-balance').innerText())).toBe(TOTAL);

    const expensesBefore = await expenses();
    const balanceBefore = await accountBalance(data.accountId);

    await row.getByTestId('pay-entry').click();
    await expect(page.getByTestId('payable-payment-dialog')).toBeVisible();
    expect(parseAmount(await page.getByTestId('payable-balance').innerText())).toBe(TOTAL);

    await page.getByTestId('payable-amount').fill(String(FIRST_PAYMENT));
    await chooseOption(page, 'payable-account', new RegExp(data.accountName));
    await page.getByTestId('submit-payable-payment').click();

    await expect(page.getByText('Pago registrado')).toBeVisible();

    await test.step('la compra queda parcialmente pagada', async () => {
      await expect(row).toContainText('Parcial');
      expect(parseAmount(await row.getByTestId('entry-balance').innerText())).toBe(
        TOTAL - FIRST_PAYMENT,
      );
    });

    await test.step('el gasto sigue siendo uno solo', async () => {
      expect((await expenses()).length).toBe(expensesBefore.length);
    });

    await test.step('el dinero salió de la cuenta', async () => {
      expect(await accountBalance(data.accountId)).toBe(balanceBefore - FIRST_PAYMENT);
    });
  });

  test('no deja pagar más de lo que se debe', async ({ page }) => {
    await page.goto('/dashboard/entries');

    const row = purchaseRow(page, fixture().purchaseProductName);
    await row.getByTestId('pay-entry').click();
    await page.getByTestId('payable-amount').fill(String(TOTAL * 2));
    await chooseOption(page, 'payable-account', new RegExp(fixture().accountName));
    await page.getByTestId('submit-payable-payment').click();

    await expect(page.getByTestId('payable-error')).toContainText(/excede el saldo/i);
  });
});

/**
 * La fila de esta compra, buscada por su producto.
 *
 * `.first()` no sirve: en esa tabla también caen la compra de pollitos que crea
 * confirmar un lote y el alimento que viene sembrado, todas con la misma fecha.
 * Por eso este spec compra un producto que es solo suyo.
 */
function purchaseRow(page: import('@playwright/test').Page, productName: string) {
  return page.getByTestId('entry-row').filter({ hasText: productName });
}

async function stockOf(productId: string): Promise<number> {
  const products = await readApi<Array<{ id: string; currentStock: string }>>('/products');
  return Number(products.find((p) => p.id === productId)?.currentStock ?? 0);
}

async function accountBalance(accountId: string): Promise<number> {
  const accounts = await readApi<Array<{ id: string; currentBalance: string }>>('/treasury/accounts');
  return Number(accounts.find((a) => a.id === accountId)?.currentBalance ?? 0);
}
