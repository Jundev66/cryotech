import { test, expect } from '@playwright/test';

test.describe('Mobile Assistant Chat QA Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept backend API requests so mobile app functions with full speed & determinism
    await page.route('**/api/users/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          email: 'granja@cryotech.test',
          fullName: 'Propietario Granja',
          role: 'owner',
        }),
      });
    });

    await page.route('**/api/companies', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '74709858-5875-4961-a332-2709bad1f3d0', name: 'Granja Avícola' },
        ]),
      });
    });

    await page.route('**/api/batches*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '00000000-0000-0000-0000-000000000001',
            code: 'LOT-2600046',
            breed: 'Cobb 500',
            currentQuantity: 920,
          },
        ]),
      });
    });

    await page.route('**/api/clients*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '11111111-1111-1111-1111-111111111111', name: 'William' },
          { id: '22222222-2222-2222-2222-222222222222', name: 'Rosa' },
          { id: '33333333-3333-3333-3333-333333333333', name: 'Carlos' },
        ]),
      });
    });

    await page.route('**/api/exchange-rates/current', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ effectiveRate: 36.5, rateSource: 'bcv' }),
      });
    });

    await page.route('**/api/sales*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'sale-1',
            code: 'VEN-2600130',
            client: { name: 'William' },
            quantity: 2,
            weightKg: 4.8,
            totalAmount: 30,
            paidAmount: 0,
          },
          {
            id: 'sale-2',
            code: 'VEN-2600131',
            client: { name: 'Rosa' },
            quantity: 1,
            weightKg: 2.7,
            totalAmount: 10.8,
            paidAmount: 0,
          },
        ]),
      });
    });

    await page.route('**/api/products*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'p-1', name: 'Pollo Beneficiado', currentStock: 87 },
        ]),
      });
    });

    await page.route('**/api/daily-logs*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Populate storage credentials
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('cryotech_access_token', 'test_e2e_token_mobile');
      localStorage.setItem('cryotech_company_id', '74709858-5875-4961-a332-2709bad1f3d0');
      localStorage.setItem(
        'cryotech_user_profile',
        JSON.stringify({
          id: 'user-1',
          email: 'granja@cryotech.test',
          fullName: 'Propietario Granja',
          role: 'owner',
        })
      );
      localStorage.setItem(
        'cryotech_companies',
        JSON.stringify([
          { id: '74709858-5875-4961-a332-2709bad1f3d0', name: 'Granja Avícola' },
        ])
      );
    });

    // Navigate to Chat page
    await page.goto('/chat');
    await expect(page.getByText('Asistente CryoTech')).toBeVisible();
  });

  test('QA-1: Visualización del Menú de Categorías en Modo Rápido (Offline)', async ({ page }) => {
    // Verify welcome message and organized category sections
    await expect(page.getByText('¡Hola! Soy tu asistente de CryoTech')).toBeVisible();
    await expect(page.getByText('Granja & Galpones')).toBeVisible();
    await expect(page.getByText('Registro Diario')).toBeVisible();
    await expect(page.getByText('Beneficio')).toBeVisible();

    await expect(page.getByText('Comercial & Ventas')).toBeVisible();
    await expect(page.getByText('Venta Rápida de Pollos')).toBeVisible();
    await expect(page.getByText('Cobrar Cuenta')).toBeVisible();
    await expect(page.getByText('Registrar Gasto')).toBeVisible();

    await expect(page.getByText('Consultas Rápidas')).toBeVisible();
    await expect(page.getByRole('button', { name: '💵 Tasa BCV', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '🐣 Stock Aves', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '📋 Clientes Deudores', exact: true })).toBeVisible();
  });

  test('QA-2: Consultas Inmediatas (Tasa BCV, Stock y Deudas)', async ({ page }) => {
    // 1. Check Tasa BCV
    await page.getByRole('button', { name: '💵 Tasa BCV', exact: true }).click();
    await expect(page.getByText(/Tasa Oficial BCV Actual/i)).toBeVisible();

    // 2. Return to Menu
    await page.getByRole('button', { name: '⬅️ Volver al Menú' }).click();
    await expect(page.getByText('Granja & Galpones').last()).toBeVisible();

    // 3. Check Stock
    await page.getByRole('button', { name: '🐣 Stock Aves', exact: true }).last().click();
    await expect(page.getByText(/Balance de Inventario en Granja/i)).toBeVisible();
    await expect(page.getByText(/Cava \(Pollo Beneficiado/i)).toBeVisible();

    // 4. Return to Menu & Check Debtors
    await page.getByRole('button', { name: '⬅️ Volver al Menú' }).last().click();
    await page.getByRole('button', { name: '📋 Clientes Deudores', exact: true }).last().click();
    await expect(page.getByText(/Reporte de Clientes Deudores/i)).toBeVisible();
    await expect(page.getByText(/William.*pollo/i)).toBeVisible();
  });

  test('QA-3: Flujo Completo de Venta Rápida por Botones (Sin escribir en teclado)', async ({ page }) => {
    // Step 1: Click Venta Rápida
    await page.getByRole('button', { name: /Venta Rápida de Pollos/i }).click();
    await expect(page.getByText(/Paso 1\/6: ¿Qué tipo de ave vas a despachar\?/i)).toBeVisible();

    // Select Pollo Beneficiado (Cava)
    await page.getByRole('button', { name: /Pollo Beneficiado/i }).click();

    // Step 2: Select Batch
    await expect(page.getByText(/Paso 2\/6: Selecciona el lote de origen/i)).toBeVisible();
    await page.getByRole('button', { name: /Galpón/i }).first().click();

    // Step 3: Select Client
    await expect(page.getByText(/Paso 3\/6: ¿A qué cliente se le entrega\?/i)).toBeVisible();
    await page.getByRole('button', { name: 'Rosa' }).click();

    // Step 4: Select Quantity (2 aves)
    await expect(page.getByText(/Paso 4\/6: ¿Cuántas aves se entregan\?/i)).toBeVisible();
    await page.getByRole('button', { name: '2 aves' }).click();

    // Step 5: Select Weight (Sugerido 4.8 kg)
    await expect(page.getByText(/Paso 5\/6: ¿Cuánto pesaron en total\?/i)).toBeVisible();
    await page.getByRole('button', { name: /4\.8/i }).click();

    // Step 6: Select Payment Status (Fiado)
    await expect(page.getByText(/Paso 6\/6: ¿Cómo se cancela la venta\?/i)).toBeVisible();
    await page.getByRole('button', { name: /Fiado \/ A Crédito/i }).click();

    // Step 7: Draft Confirmation Card
    await expect(page.getByText('Operación Lista para Guardar')).toBeVisible();
    await expect(page.getByText(/Rosa/i).last()).toBeVisible();
    await expect(page.getByText(/2 aves/i).last()).toBeVisible();
    await expect(page.getByText(/4\.80 kg/i).first()).toBeVisible();
    await expect(page.getByText(/Fiado \(Crédito\)/i)).toBeVisible();

    // Confirm and save
    await page.getByRole('button', { name: /Confirmar y Guardar/i }).click();
    await expect(page.getByText('¡Registrado exitosamente en el sistema!')).toBeVisible();
    await expect(page.getByText('¡Operación guardada exitosamente en el sistema!')).toBeVisible();
  });

  test('QA-4: Flujo de Registro Diario (Mortalidad y Consumo)', async ({ page }) => {
    await page.getByRole('button', { name: /Registro Diario/i }).first().click();

    // Step 1: Select Batch
    await expect(page.getByText(/Paso 1\/4: Selecciona el lote/i)).toBeVisible();
    await page.getByRole('button', { name: /Galpón/i }).first().click();

    // Step 2: Mortality
    await expect(page.getByText(/Paso 2\/4: ¿Cuántas bajas o muertes hubo hoy\?/i)).toBeVisible();
    await page.getByRole('button', { name: '2 bajas', exact: true }).click();

    // Step 3: Feed
    await expect(page.getByText(/Paso 3\/4: ¿Cuánto alimento consumieron hoy\?/i)).toBeVisible();
    await page.getByRole('button', { name: /50 kg/i }).click();

    // Step 4: Weight sampling
    await expect(page.getByText(/Paso 4\/4: ¿Se realizó pesaje de muestreo\?/i)).toBeVisible();
    await page.getByRole('button', { name: /Omitir/i }).click();

    // Step 5: Draft Card
    await expect(page.getByText('Operación Lista para Guardar')).toBeVisible();
    await expect(page.getByText('2 bajas, 50 kg alimento')).toBeVisible();

    // Confirm and save
    await page.getByRole('button', { name: /Confirmar y Guardar/i }).click();
    await expect(page.getByText('¡Registrado exitosamente en el sistema!')).toBeVisible();
  });

  test('QA-5: Cancelación de Flujo y Reanudación del Menú', async ({ page }) => {
    await page.getByRole('button', { name: /Cobrar Cuenta/i }).click();
    await expect(page.getByText(/Paso 1\/3: ¿A qué cliente se le recibe el pago\?/i)).toBeVisible();

    // Cancel flow
    await page.getByRole('button', { name: '❌ Cancelar' }).click();
    await expect(page.getByText('Operación cancelada. ¿Qué otra cosa deseas hacer?')).toBeVisible();
    await expect(page.getByText('Comercial & Ventas').last()).toBeVisible();
  });

  test('QA-6: Entrada Manual por Teclado y Cancelación de Draft', async ({ page }) => {
    const input = page.getByPlaceholder('O escribe una instrucción...');
    await input.fill('Murieron 3 hoy y comieron 70kg');
    await page.locator('button[type="submit"]').click();

    // Draft appears
    await expect(page.getByText('Operación Lista para Guardar')).toBeVisible();
    await expect(page.getByText('3 bajas, 70 kg alimento', { exact: true })).toBeVisible();

    // Cancel draft
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Operación cancelada')).toBeVisible();
  });

  test('QA-7: Ingreso Manual de Peso y Creación de Nuevo Cliente en Venta', async ({ page }) => {
    await page.getByRole('button', { name: /Venta Rápida de Pollos/i }).click();
    await page.getByRole('button', { name: /Pollo en Pie/i }).click();
    await page.getByRole('button', { name: /Galpón/i }).first().click();

    // Step 3: Click ➕ Nuevo Cliente
    await page.getByRole('button', { name: /Nuevo Cliente/i }).click();
    await expect(page.getByText(/Escribe el nombre del nuevo cliente/i)).toBeVisible();

    // Type new client name in input bar
    const clientInput = page.getByPlaceholder(/Escribe el nombre del cliente/i);
    await clientInput.fill('Don Jose Bodega');
    await page.locator('button[type="submit"]').click();

    // Step 4: Quantity (3 aves)
    await expect(page.getByText(/Paso 4\/6: ¿Cuántas aves se entregan\?/i)).toBeVisible();
    await page.getByRole('button', { name: '3 aves' }).click();

    // Step 5: Manual weight entry via keyboard
    await expect(page.getByText(/Paso 5\/6: ¿Cuánto pesaron en total\?/i)).toBeVisible();
    const weightInput = page.getByPlaceholder(/Escribe los kilos/i);
    await weightInput.fill('7.35');
    await page.locator('button[type="submit"]').click();

    // Step 6: Payment condition (Contado)
    await expect(page.getByText(/Paso 6\/6: ¿Cómo se cancela la venta\?/i)).toBeVisible();
    await page.getByRole('button', { name: /Pagado de Contado/i }).click();

    // Step 7: Draft with custom weight and new client
    await expect(page.getByText('Operación Lista para Guardar')).toBeVisible();
    await expect(page.getByText(/7\.35 kg/i).first()).toBeVisible();
    await expect(page.getByText(/3 aves/i).last()).toBeVisible();

    // Confirm
    await page.getByRole('button', { name: /Confirmar y Guardar/i }).click();
    await expect(page.getByText('¡Registrado exitosamente en el sistema!')).toBeVisible();
  });
});
