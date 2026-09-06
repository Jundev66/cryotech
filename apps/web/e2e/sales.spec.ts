import { test, expect } from '@playwright/test';
import { chooseOption, fixture, parseAmount, readApi } from './fixtures';

/**
 * The money path, done the way the farmer does it: sell on credit, then collect.
 *
 * This is the flow the whole system exists for, and the one where a mistake
 * costs real money — a collection that updates the sale but never moves the
 * cash leaves the books saying you were paid while the bank disagrees.
 */
// Serial on purpose: the filter test reads the sale the first test creates.
// Declaring it means a failure in the first skips the second instead of
// producing a second, misleading failure.
test.describe.serial('Ventas y cobros', () => {
  const KILOS = 50;
  const PRICE_PER_KG = 4;
  const TOTAL = KILOS * PRICE_PER_KG;
  const FIRST_PAYMENT = 80;
  /** What globalSetup put in the test account, as a movement. */
  const OPENING_BALANCE = 500_000;

  test('vender fiado, cobrar una parte y ver bajar el saldo', async ({ page }) => {
    const data = fixture();

    await page.goto('/dashboard/sales');
    await expect(page.getByRole('heading', { name: 'Ventas' })).toBeVisible();

    await test.step('registrar la venta', async () => {
      await page.getByTestId('new-sale').click();

      await chooseOption(page, 'sale-batch', /Cobb 500/);
      await chooseOption(page, 'sale-client', data.clientName);

      await page.getByTestId('sale-quantity').fill('20');
      await page.getByTestId('sale-weight').fill(String(KILOS));
      await page.getByTestId('sale-price-kg').fill(String(PRICE_PER_KG));
      await page.getByTestId('sale-total').fill(String(TOTAL));

      await page.getByTestId('submit-sale').click();
      await expect(page.getByText('Venta registrada')).toBeVisible();
    });

    // Su propia venta, por código. `.first()` la daba por la más reciente de la
    // tabla, y cuando otro spec vendía después el saldo que leía era el de una
    // venta ajena — fallando por el orden de los specs, no por un bug.
    const code = await saleCode(data.clientName, TOTAL);
    const row = page.locator(`[data-testid="sale-row"][data-code="${code}"]`);

    await test.step('aparece en la lista, sin cobrar', async () => {
      await expect(row).toBeVisible();
      await expect(row).toContainText(data.clientName);
      await expect(row).toContainText('Pendiente');
      // Nothing has been collected, so the balance is the whole sale.
      expect(parseAmount(await row.getByTestId('sale-balance').innerText())).toBe(TOTAL);
    });

    await test.step('cobrar una parte', async () => {
      await row.click();
      await expect(page.getByRole('heading', { name: 'Detalle de Venta' })).toBeVisible();

      await page.getByTestId('payment-amount').fill(String(FIRST_PAYMENT));
      await chooseOption(page, 'payment-account', new RegExp(data.accountName));
      await page.getByTestId('submit-payment').click();

      await expect(page.getByText('Cobro registrado')).toBeVisible();

      const balance = page.getByTestId('sale-detail-balance');
      await expect(balance).toBeVisible();
      expect(parseAmount(await balance.innerText())).toBe(TOTAL - FIRST_PAYMENT);
    });

    await test.step('la lista refleja el cobro', async () => {
      await page.keyboard.press('Escape');
      await expect(row).toContainText('Parcial');
      expect(parseAmount(await row.getByTestId('sale-balance').innerText())).toBe(
        TOTAL - FIRST_PAYMENT,
      );
    });

    await test.step('el dinero llegó a la cuenta', async () => {
      // The half that is easy to get wrong: a collection that updates the sale
      // but never moves the cash leaves the books saying you were paid while
      // the bank balance disagrees.
      await page.goto('/dashboard/treasury');
      // The totals render as 0 until the accounts query resolves, so reading
      // them before the table exists measures the loading state, not the data.
      await expect(page.getByTestId('accounts-table')).toContainText(data.accountName);

      // Opening balance plus the collection converted to bolivares. The exact
      // figure depends on today's BCV rate, so what is asserted is that it
      // rose — a fixed number would break tomorrow for no reason.
      const total = parseAmount(await page.getByTestId('total-ves').innerText());
      expect(total).toBeGreaterThan(OPENING_BALANCE);

      await page.getByTestId('tab-movements').click();
      await expect(page.getByTestId('movements-table')).toContainText(data.accountName);
    });
  });

  test('los Ingresos Totales suman lo que dicen los libros', async ({ page }) => {
    // Con una sola venta no se nota: concatenar "120" da 120. Hacen falta dos
    // para que la suma rota se vea — "12"+"45.5" es "1245.5", no 57,5.
    const data = fixture();
    await page.goto('/dashboard/sales');

    await page.getByTestId('new-sale').click();
    await chooseOption(page, 'sale-batch', /Cobb 500/);
    await chooseOption(page, 'sale-client', data.clientName);
    await page.getByTestId('sale-quantity').fill('3');
    await page.getByTestId('sale-weight').fill('3');
    await page.getByTestId('sale-price-kg').fill('4');
    await page.getByTestId('sale-total').fill('12');
    await page.getByTestId('submit-sale').click();
    await expect(page.getByText('Venta registrada')).toBeVisible();

    // Que la segunda esté en pantalla. Contarlas suponía ser el único spec que
    // vende, y desde que se prueba la venta de beneficiado no lo es.
    const second = await saleCode(data.clientName, 12);
    await expect(page.locator(`[data-testid="sale-row"][data-code="${second}"]`)).toBeVisible();

    const sales = await readApi<Array<{ totalAmount: number }>>('/sales');
    const expected = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);

    expect(parseAmount(await page.getByTestId('sales-total-revenue').innerText())).toBe(expected);
  });

  test('cobrar de más dice por qué, no "Error al registrar cobro"', async ({ page }) => {
    // La API explica: "El monto (Bs X) excede el saldo pendiente (Bs Y)". Esa
    // frase es la que dice qué hacer, y la interfaz la tiraba.
    const data = fixture();
    await page.goto('/dashboard/sales');

    await page.getByTestId('sale-row').filter({ hasText: 'Parcial' }).first().click();
    await expect(page.getByRole('heading', { name: 'Detalle de Venta' })).toBeVisible();

    await page.getByTestId('payment-amount').fill('99999');
    await chooseOption(page, 'payment-account', new RegExp(data.accountName));
    await page.getByTestId('submit-payment').click();

    await expect(page.getByText(/excede el saldo pendiente/i)).toBeVisible();
  });

  test('el filtro por estado de pago responde', async ({ page }) => {
    await page.goto('/dashboard/sales');

    await page.getByRole('tab', { name: 'Pagados' }).click();
    // The only sale in this company is partially paid, so "paid" must be empty.
    await expect(page.getByTestId('sales-empty')).toBeVisible();

    await page.getByRole('tab', { name: 'Parciales' }).click();
    await expect(page.getByTestId('sale-row')).toHaveCount(1);
  });
});

/** El código de la venta recién creada, para no depender del orden de la tabla. */
async function saleCode(clientName: string, total: number): Promise<string> {
  const sales = await readApi<
    Array<{ code: string | null; totalAmount: number; client: { name: string } | null }>
  >('/sales');
  const mine = sales.find(
    (sale) => sale.client?.name === clientName && Math.abs(Number(sale.totalAmount) - total) < 0.01,
  );
  if (!mine?.code) throw new Error(`No encontré la venta de ${clientName} por $${total}`);
  return mine.code;
}
