import { test, expect } from '@playwright/test';

/**
 * Buscar clientes escribiendo.
 *
 * Lo que se prueba no es que el filtro filtre —eso lo hace cualquier `ILIKE`—
 * sino que encuentre lo que la gente escribe de verdad. Nadie teclea el acento
 * de "José" al buscarlo, y Postgres ignora las mayúsculas pero no los acentos:
 * sin el respaldo difuso del servidor, buscar "jose" devuelve una tabla vacía y
 * le dice al usuario que el cliente no existe.
 */
test.describe.serial('Busqueda de clientes', () => {
  const ACCENTED = 'Avícola Jesús Peña';

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/clients');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  });

  test('un cliente con acentos se encuentra escribiendo sin ellos', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click();
    await page.getByLabel('Nombre').fill(ACCENTED);
    await page.getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('cell', { name: ACCENTED })).toBeVisible();

    // Sin acentos y en minúscula: el camino literal no lo encuentra, el difuso sí.
    await page.getByTestId('clients-search').fill('jesus pena');
    await expect(page.getByRole('cell', { name: ACCENTED })).toBeVisible();

    // Y el término viaja en la URL, así que recargar no lo pierde.
    await expect(page).toHaveURL(/[?&]q=jesus\+pena/);
    await page.reload();
    await expect(page.getByRole('cell', { name: ACCENTED })).toBeVisible();
  });

  test('la busqueda acota la tabla y sabe decir que no hay nada', async ({ page }) => {
    await page.getByTestId('clients-search').fill('jesus');
    await expect(page.getByTestId('client-row')).toHaveCount(1);

    await page.getByTestId('clients-search').fill('zzzzz no existe');
    await expect(page.getByTestId('clients-empty')).toContainText('Sin resultados');

    // Limpiar devuelve la lista completa, no la deja filtrada en silencio.
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
    await expect(page.getByTestId('client-row').first()).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]q=/);
  });

  test('el selector de cliente de una venta filtra escribiendo', async ({ page }) => {
    await page.goto('/dashboard/sales');
    await page.getByTestId('new-sale').click();
    await page.getByTestId('sale-client').click();

    await page.getByTestId('combobox-search').fill('jesus pena');
    await expect(page.getByRole('option', { name: ACCENTED })).toBeVisible();

    await page.getByRole('option', { name: ACCENTED }).click();
    // Elegido: el disparador muestra el nombre aunque la búsqueda se limpie.
    await expect(page.getByTestId('sale-client')).toContainText(ACCENTED);
  });
});
