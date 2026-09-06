import { test, expect } from '@playwright/test';
import { fixture, parseAmount, readApi } from './fixtures';

/**
 * The ledger has to agree with itself.
 *
 * Every balance on this screen is derived from movements, so a balance that
 * drifts from them means something wrote behind the ledger's back — which is
 * the one failure mode that silently corrupts the accounts.
 *
 * Deliberately independent of `sales.spec.ts`: a test that only passes because
 * another test ran first fails for reasons that have nothing to do with it.
 */
test.describe('Tesorería', () => {
  test('la cuenta muestra su apertura y los saldos cuadran', async ({ page }) => {
    const data = fixture();

    await page.goto('/dashboard/treasury');
    await expect(page.getByRole('heading', { name: /Tesorer/ })).toBeVisible();

    await test.step('la cuenta existe con su saldo de apertura', async () => {
      await expect(page.getByTestId('accounts-table')).toContainText(data.accountName);
      // Contra el libro, no contra un piso: el total de la pantalla tiene que
      // ser exactamente la suma de los saldos activos en bolívares. Un
      // `>= 500.000` pasaba o fallaba según cuánto hubiera gastado el resto de
      // la suite antes, que no dice nada sobre esta pantalla.
      const accounts = await readApi<
        Array<{ currency: string; isActive: boolean; currentBalance: number }>
      >('/treasury/accounts?includeInactive=true');
      const ledger = accounts
        .filter((account) => account.isActive && account.currency === 'VES')
        .reduce((sum, account) => sum + Number(account.currentBalance), 0);

      const total = parseAmount(await page.getByTestId('total-ves').innerText());
      expect(Math.abs(total - ledger), `pantalla ${total} vs libro ${ledger}`).toBeLessThan(0.02);
    });

    await test.step('la apertura está como movimiento, no como saldo suelto', async () => {
      await page.getByTestId('tab-movements').click();
      const movements = page.getByTestId('movements-table');
      await expect(movements).toBeVisible();
      await expect(movements).toContainText(data.accountName);
      await expect(movements).toContainText('Saldo inicial E2E');
    });

    await test.step('la reconciliación no encuentra diferencias', async () => {
      await page.getByTestId('tab-accounts').click();
      await page.getByTestId('treasury-reconcile').click();
      await expect(page.getByText(/todo cuadra/i)).toBeVisible();
    });
  });

  test('se puede registrar la apertura de una cuenta que ya existe', async ({ page }) => {
    // El caso del BDV real: una cuenta creada sin saldo de apertura, que hasta
    // ahora no había forma de corregir desde la aplicación.
    await page.goto('/dashboard/treasury');

    await page.getByTestId('treasury-new-account').click();
    await page.getByTestId('account-name').fill('Cuenta Sin Apertura');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('accounts-table')).toContainText('Cuenta Sin Apertura');

    const row = page.getByRole('row', { name: /Cuenta Sin Apertura/ });
    await row.getByTestId('new-movement').click();
    await expect(page.getByTestId('movement-dialog')).toBeVisible();

    await page.getByTestId('movement-amount').fill('7500');
    await page.getByTestId('movement-concept').fill('Saldo inicial');
    await page.getByTestId('submit-movement').click();
    await expect(page.getByText('Movimiento registrado')).toBeVisible();

    await test.step('el saldo lo explica el libro', async () => {
      expect(parseAmount(await row.getByRole('cell').nth(4).innerText())).toBe(7500);

      await page.getByTestId('tab-movements').click();
      await expect(page.getByTestId('movements-table')).toContainText('Saldo inicial');

      await page.getByTestId('tab-accounts').click();
      await page.getByTestId('treasury-reconcile').click();
      await expect(page.getByText(/todo cuadra/i)).toBeVisible();
    });
  });

  test('crear una cuenta nueva registra su apertura como movimiento', async ({ page }) => {
    await page.goto('/dashboard/treasury');

    await page.getByTestId('treasury-new-account').click();
    await page.getByTestId('account-name').fill('Banco E2E');
    await page.getByTestId('account-opening-balance').fill('1000');
    await page.getByTestId('account-save').click();

    await expect(page.getByTestId('accounts-table')).toContainText('Banco E2E');

    // The opening balance must arrive through the ledger, not as a direct write:
    // a balance set behind the ledger's back is what reconciliation exists for.
    await page.getByTestId('tab-movements').click();
    await expect(page.getByTestId('movements-table')).toContainText('Banco E2E');

    await page.getByTestId('tab-accounts').click();
    await page.getByTestId('treasury-reconcile').click();
    await expect(page.getByText(/todo cuadra/i)).toBeVisible();
  });
});
