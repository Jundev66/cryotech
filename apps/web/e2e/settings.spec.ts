import { test, expect } from '@playwright/test';
import { chooseOption } from './fixtures';

/**
 * Lo que se configura una vez y condiciona todo lo demás.
 *
 * Igual que en el catálogo, lo que se cuida no es que el formulario guarde sino
 * que lo guardado **sirva**: una categoría nueva tiene que poder elegirse al
 * crear un producto, o no existe para el negocio.
 *
 * Se llenan por su texto visible (`placeholder`, etiquetas), porque estos
 * formularios no usan `data-testid` y ponerlos solo para el test escondería un
 * cambio de copy que al usuario sí lo afecta.
 */
test.describe.serial('Configuración', () => {
  const UNIT = 'Bultos E2E';
  const CATEGORY = 'Desinfectantes';

  test('una unidad nueva se puede usar en un producto', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.getByRole('tab', { name: 'Unidades' }).click();

    await page.getByRole('button', { name: 'Nueva Unidad' }).click();
    await page.getByPlaceholder('Ej: Kilogramos').fill(UNIT);
    await page.getByPlaceholder('Ej: kg').fill('blt');
    await page.getByRole('button', { name: 'Crear Unidad' }).click();

    await expect(page.getByText(UNIT)).toBeVisible();

    await page.goto('/dashboard/products');
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByTestId('product-unit').click();
    await expect(page.getByRole('option', { name: new RegExp(UNIT) })).toBeVisible();
  });

  test('una categoría nueva se puede elegir en un producto', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.getByRole('tab', { name: 'Categorias' }).click();

    await page.getByRole('button', { name: 'Nueva Categoria' }).click();
    await page.getByPlaceholder('Ej: Vacunas', { exact: true }).fill(CATEGORY);
    await page.getByRole('button', { name: 'Crear Categoria' }).click();

    await expect(page.getByText(CATEGORY).first()).toBeVisible();

    await page.goto('/dashboard/products');
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('Nombre').fill('Yodo E2E');
    await chooseOption(page, 'product-category', CATEGORY);
    await chooseOption(page, 'product-unit', new RegExp(UNIT));
    await page.getByRole('button', { name: 'Crear' }).click();

    await expect(page.getByRole('cell', { name: 'Yodo E2E' })).toBeVisible();
  });
});

test.describe('Usuarios y roles', () => {
  test('crear un rol lo deja disponible para asignar', async ({ page }) => {
    await page.goto('/dashboard/users');
    await expect(page.getByRole('heading', { name: /Usuarios/ })).toBeVisible();

    await page.getByRole('tab', { name: 'Roles' }).click();
    await page.getByRole('button', { name: 'Nuevo Rol' }).click();
    await page.getByPlaceholder('Ej: Operario').fill('Encargado E2E');
    await page.getByRole('button', { name: 'Crear rol' }).click();

    await expect(page.getByText('Encargado E2E').first()).toBeVisible();
  });
});
