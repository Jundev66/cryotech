import { test, expect } from '@playwright/test';
import { fixture } from './fixtures';
import { randomPassword } from './global-setup';

/**
 * La recuperación de contraseña que hay: el dueño se la cambia al trabajador.
 *
 * No existe autoservicio por correo porque el proyecto no tiene por dónde
 * mandarlo, así que hasta ahora un trabajador que olvidaba su contraseña solo
 * se arreglaba entrando a la base con `psql`.
 *
 * Se prueba entera —cambiar, entrar con la nueva, y que la vieja ya no valga—
 * porque un reseteo que deja funcionando la contraseña anterior no es un
 * reseteo, es un segundo acceso.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3011/api';

test.describe.serial('Cambiar la contraseña de un trabajador', () => {
  const OLD_PASSWORD = randomPassword();
  const NEW_PASSWORD = randomPassword();

  let workerEmail = '';

  test('el dueño le pone una contraseña nueva', async ({ page }) => {
    const data = fixture();
    workerEmail = `e2e-trabajador-${Date.now()}@cryotech.test`;

    // El trabajador se registra por su cuenta; el dueño solo lo mete en la
    // empresa, que es como funciona: `addMember` busca un usuario que ya existe.
    await post('/auth/register', {
      email: workerEmail,
      password: OLD_PASSWORD,
      confirmPassword: OLD_PASSWORD,
      fullName: 'Trabajador E2E',
    });

    await page.goto('/dashboard/users');
    await page.getByTestId('add-member').click();
    await page.getByTestId('member-email').fill(workerEmail);
    await page.getByTestId('submit-member').click();
    await expect(page.getByText(workerEmail)).toBeVisible();

    const row = page.getByRole('row', { name: new RegExp(workerEmail) });
    await row.getByTestId('member-set-password').click();
    await expect(page.getByTestId('member-password-dialog')).toBeVisible();

    await page.getByTestId('member-password').fill(NEW_PASSWORD);
    await page.getByTestId('submit-member-password').click();
    await expect(page.getByText(/Contraseña cambiada/i)).toBeVisible();

    void data;
  });

  test('la nueva sirve y la vieja ya no', async ({ page }) => {
    // Sin la sesión del dueño: aquí entra el trabajador.
    await page.context().clearCookies();

    const withOld = await login(workerEmail, OLD_PASSWORD);
    expect(withOld, 'la contraseña anterior tiene que dejar de valer').toBe(401);

    const withNew = await login(workerEmail, NEW_PASSWORD);
    // 201, no 200: `@Post` en Nest devuelve 201 y a login nadie le puso @HttpCode.
    expect(withNew, 'la nueva tiene que servir').toBe(201);
  });

  test('al propietario no se le puede cambiar desde la aplicación', async ({ page }) => {
    // Es lo que impide que alguien con `users.edit` se quede con la empresa
    // ajena cambiándole la contraseña al dueño. El botón ni siquiera aparece.
    await page.goto('/dashboard/users');
    const owner = page.getByRole('row', { name: /Propietario/ });
    await expect(owner).toBeVisible();
    await expect(owner.getByTestId('member-set-password')).toHaveCount(0);
  });
});

async function login(email: string, password: string): Promise<number> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return response.status;
}

async function post(path: string, body: unknown) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} respondió ${response.status}: ${await response.text()}`);
  }
  return response.json();
}
