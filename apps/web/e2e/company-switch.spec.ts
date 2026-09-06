import { test, expect } from '@playwright/test';
import { fixture } from './fixtures';

/**
 * Cambiar de empresa no puede dejar en pantalla los datos de la anterior.
 *
 * El aislamiento del servidor estaba bien —cada consulta lleva su `companyId` y
 * la cabecera se valida— pero eso no salva al navegador: de las 99 consultas de
 * la aplicación, 93 tienen una clave que no menciona la empresa ('sales',
 * 'clients', 'treasury/accounts'), así que después de cambiar TanStack seguía
 * resolviéndolas con lo que ya tenía. Los clientes de una granja bajo el nombre
 * de la otra, hasta que cada consulta refrescara por su cuenta.
 *
 * Cerrar sesión nunca tuvo el problema porque hace `window.location.href` y eso
 * recarga la página entera. Cambiar de empresa no recarga nada, y por eso hace
 * falta esta prueba: es una fuga que solo existe en el cliente y que ninguna
 * suite del servidor puede ver.
 *
 * Se comprueba con clientes porque es el dato más inconfundible: un nombre
 * propio no aparece por casualidad en la pantalla de otra empresa.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3011/api';

test.describe.serial('Cambio de empresa', () => {
  let secondCompanyId = '';
  let secondCompanyName = '';
  let secondClientName = '';

  test('la segunda empresa arranca con su propio cliente', async () => {
    const data = fixture();
    const stamp = Date.now();
    secondCompanyName = `E2E Segunda ${stamp}`;
    secondClientName = `Solo-De-La-Segunda-${stamp}`;

    // Por la API: montar una empresa entera por la interfaz sería probar el
    // onboarding, que tiene su propio sitio. Lo que se prueba aquí es el cambio.
    const company = await post('/companies', { name: secondCompanyName }, data.accessToken);
    secondCompanyId = company.id;

    // Con galpón: sin él, el guard del dashboard la considera un onboarding a
    // medias y manda a terminarlo — que es lo correcto, pero deja esta prueba
    // mirando un formulario en vez de la lista de clientes.
    await post('/warehouses', { name: 'Galpón Segunda', capacity: 100 }, data.accessToken, secondCompanyId);
    await post('/clients', { name: secondClientName }, data.accessToken, secondCompanyId);

    expect(secondCompanyId).toBeTruthy();
  });

  // Ida y vuelta en la misma prueba a propósito: cada test arranca con el
  // `storageState` guardado, o sea con la primera empresa seleccionada otra vez,
  // así que partirlo en dos dejaría al segundo empezando donde no cree.
  test('al cambiar no queda ni rastro de los clientes de la otra', async ({ page }) => {
    const data = fixture();

    await page.goto('/dashboard/clients');
    // Primero se cargan los de la primera: si no llegaran a estar en caché, la
    // prueba pasaría por no haber nada que filtrar, que no demuestra nada.
    await expect(page.getByText(data.clientName)).toBeVisible();

    await switchTo(page, secondCompanyName);
    await expect(page.getByText(secondClientName)).toBeVisible();
    // Este es el que fallaba: el cliente de la primera seguía en pantalla.
    await expect(page.getByText(data.clientName)).toHaveCount(0);

    await switchTo(page, data.companyName);
    await expect(page.getByText(data.clientName)).toBeVisible();
    await expect(page.getByText(secondClientName)).toHaveCount(0);
  });
});

async function switchTo(page: import('@playwright/test').Page, companyName: string) {
  await page.getByTestId('company-switcher').click();
  await page.getByTestId('company-option').filter({ hasText: companyName }).click();
}

async function post(path: string, body: unknown, token: string, companyId?: string) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(companyId ? { 'X-Company-Id': companyId } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} respondió ${response.status}: ${await response.text()}`);
  }
  return response.json();
}
