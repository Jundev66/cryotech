import { test, expect } from '@playwright/test';
import { chooseOption } from './fixtures';

/**
 * Clientes, productos y galpones: lo que se llena una vez y se usa todos los días.
 *
 * Crear no es lo interesante — lo interesante es que lo creado **aparezca donde
 * se usa**. Un cliente que no sale en el desplegable de ventas no existe para
 * el negocio, aunque la tabla de clientes lo muestre.
 *
 * Aquí no hay `data-testid`: estos formularios usan etiquetas de verdad, así
 * que el test los llena por su etiqueta visible. Si mañana el campo dice otra
 * cosa, el test se rompe — y debe, porque al usuario también le cambió.
 */
test.describe.serial('Catálogo', () => {
  const CLIENT = 'Panadería El Trigal';
  const PRODUCT = 'Vacuna Newcastle';
  const WAREHOUSE = 'Galpón Nuevo';

  test('un cliente nuevo se puede elegir al vender', async ({ page }) => {
    await page.goto('/dashboard/clients');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo Cliente' }).click();
    await page.getByLabel('Nombre').fill(CLIENT);
    await page.getByLabel('Telefono').fill('04141112233');
    await page.getByRole('button', { name: 'Crear' }).click();

    await expect(page.getByRole('cell', { name: CLIENT })).toBeVisible();

    // Lo que importa: que sirva para vender.
    await page.goto('/dashboard/sales');
    await page.getByTestId('new-sale').click();
    await page.getByTestId('sale-client').click();
    await expect(page.getByRole('option', { name: CLIENT })).toBeVisible();
  });

  test('editar un cliente cambia lo que se ve', async ({ page }) => {
    await page.goto('/dashboard/clients');

    await page.getByRole('row', { name: new RegExp(CLIENT) }).getByRole('button').first().click();
    await page.getByLabel('Telefono').fill('04149998877');
    await page.getByRole('button', { name: 'Actualizar' }).click();

    await expect(page.getByRole('cell', { name: '04149998877' })).toBeVisible();
  });

  test('un producto nuevo se puede comprar', async ({ page }) => {
    await page.goto('/dashboard/products');
    await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('Nombre').fill(PRODUCT);
    await chooseOption(page, 'product-category', 'Vacuna');
    await chooseOption(page, 'product-unit', /Mililitros/);
    await page.getByRole('button', { name: 'Crear' }).click();

    await expect(page.getByRole('cell', { name: PRODUCT })).toBeVisible();

    await page.goto('/dashboard/entries');
    await page.getByTestId('new-entry').click();
    await page.getByTestId('entry-product').click();
    await expect(page.getByRole('option', { name: new RegExp(PRODUCT) })).toBeVisible();
  });

  test('un galpón nuevo se puede usar para un lote', async ({ page }) => {
    await page.goto('/dashboard/warehouses');
    await expect(page.getByRole('heading', { name: /Galpones/ })).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo Galpon' }).click();
    await page.getByLabel('Nombre').fill(WAREHOUSE);
    await page.getByLabel('Capacidad').fill('800');
    await page.getByRole('button', { name: 'Crear' }).click();

    // Los galpones se muestran como tarjetas, no como filas de tabla.
    await expect(page.getByText(WAREHOUSE, { exact: true })).toBeVisible();

    await page.goto('/dashboard/batches');
    await page.getByTestId('new-batch').click();
    await page.getByTestId('batch-warehouse').click();
    await expect(page.getByRole('option', { name: WAREHOUSE })).toBeVisible();
  });
});
