import { test, expect } from '@playwright/test';
import { fixture } from './fixtures';

/**
 * La puerta de entrada, con el formulario de verdad.
 *
 * El resto de la suite entra con la sesión ya guardada, así que si el login se
 * rompiera nadie se enteraría hasta que un usuario no pudiera entrar. Estos
 * tests son los únicos que empiezan sin sesión.
 */
test.describe('Entrar', () => {
  // Sin `storageState`: aquí se trata precisamente de no tener sesión.
  test.use({ storageState: { cookies: [], origins: [] } });


  test('sin sesión, cualquier pantalla manda al login', async ({ page }) => {
    await page.goto('/dashboard/sales');
    await expect(page).toHaveURL(/\/login/);
  });

  test('con la contraseña correcta se entra', async ({ page }) => {
    const data = fixture();

    await page.goto('/login');
    await page.getByLabel('Correo electronico').fill(data.email);
    await page.getByLabel('Contrasena').fill(data.password);
    await page.getByRole('button', { name: 'Iniciar sesion' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    // Y ya se ve la empresa, no solo la ruta.
    await expect(page.getByText(data.companyName)).toBeVisible();
  });

  test('el correo entra igual con mayúsculas que sin ellas', async ({ page }) => {
    const data = fixture();

    // El teclado del teléfono pone la primera letra en mayúscula solo, y el
    // índice único de Postgres distingue mayúsculas: sin normalizar,
    // `E2e-123@…` y `e2e-123@…` eran dos cuentas y quien se registró con una no
    // podía entrar escribiendo la otra — en su propia cuenta, sin salida,
    // porque tampoco hay recuperación por correo.
    const shouted = data.email.toUpperCase();
    expect(shouted, 'el correo de prueba tiene que tener letras').not.toBe(data.email);

    await page.goto('/login');
    await page.getByLabel('Correo electronico').fill(shouted);
    await page.getByLabel('Contrasena').fill(data.password);
    await page.getByRole('button', { name: 'Iniciar sesion' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('con la contraseña equivocada no se entra', async ({ page }) => {
    const data = fixture();

    await page.goto('/login');
    await page.getByLabel('Correo electronico').fill(data.email);
    await page.getByLabel('Contrasena').fill('esta-no-es');

    // Esperar la respuesta del servidor, no un texto: así el test sabe que el
    // intento llegó a ocurrir y no pasó por no haberse enviado nunca.
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/auth/login')),
      page.getByRole('button', { name: 'Iniciar sesion' }).click(),
    ]);
    expect(response.status()).toBe(401);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
