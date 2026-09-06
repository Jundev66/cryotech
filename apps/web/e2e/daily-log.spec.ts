import { test, expect } from '@playwright/test';
import { chooseOption, fixture } from './fixtures';

/**
 * The thing that gets done every single day, and the rule behind it.
 *
 * Recording a death is not just a row in a table — it has to come off the
 * batch. A daily log that leaves `currentQuantity` untouched would slowly
 * inflate the flock on paper, and by the time anyone notices there is no way
 * to reconstruct which day went wrong.
 */
test.describe.serial('Registro diario', () => {
  const DEATHS = 4;

  test('registrar mortalidad descuenta aves del lote', async ({ page }) => {
    const data = fixture();

    const before = await test.step('cuántas aves hay ahora', async () => {
      await page.goto('/dashboard/batches');
      const row = page.getByTestId('batch-row').filter({ hasText: data.batchCode });
      await expect(row).toBeVisible();
      return Number((await row.getByTestId('batch-row-quantity').innerText()).replace(/\D/g, ''));
    });

    await test.step('registrar el día', async () => {
      await page.goto('/dashboard/daily-logs');
      await page.getByTestId('toggle-daily-log-form').click();

      await chooseOption(page, 'log-batch', /Cobb 500/);
      await page.getByTestId('log-mortality').fill(String(DEATHS));
      await page.getByTestId('submit-daily-log').click();

      await expect(page.getByTestId('daily-log-row').first()).toContainText(String(DEATHS));
    });

    await test.step('el lote tiene esas aves de menos', async () => {
      await page.goto('/dashboard/batches');
      const row = page.getByTestId('batch-row').filter({ hasText: data.batchCode });
      const after = Number((await row.getByTestId('batch-row-quantity').innerText()).replace(/\D/g, ''));
      expect(after).toBe(before - DEATHS);
    });
  });

  test('no acepta dos registros del mismo día para el mismo lote', async ({ page }) => {
    // One log per batch per day is the rule; a second one would double-count
    // the day's deaths and feed.
    await page.goto('/dashboard/daily-logs');
    await page.getByTestId('toggle-daily-log-form').click();

    await chooseOption(page, 'log-batch', /Cobb 500/);
    await page.getByTestId('log-mortality').fill('1');
    await page.getByTestId('submit-daily-log').click();

    await expect(page.getByTestId('daily-log-row')).toHaveCount(1);
  });
});
