import { test, expect, type APIRequestContext } from '@playwright/test';
import { fixture } from './fixtures';
import { randomPassword } from './global-setup';

/**
 * Autorización, contra la API directamente.
 *
 * El resto de la suite conduce la interfaz, que es lo correcto para probar
 * funcionalidad. Esto no: un atacante no usa la pantalla, manda peticiones. Lo
 * que se comprueba aquí es que el servidor dice que no por su cuenta, sin
 * depender de que el frontend esconda un botón.
 *
 * Cada caso corresponde a un hallazgo de la auditoría del 2026-08-09. Si alguno
 * se pone en verde por las razones equivocadas —porque el endpoint ya no existe,
 * por ejemplo— el fallo se ve en el que comprueba el acceso legítimo.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3011/api';

/** Contraseña del intruso. Cumple la política: 10+, mayúscula, minúscula, dígito. */
const OUTSIDER_PASSWORD = randomPassword();

interface Session {
  token: string;
  companyId: string;
  userId: string;
}

async function registerOutsider(request: APIRequestContext): Promise<Session> {
  const stamp = Date.now();
  const email = `e2e-intruso-${stamp}@cryotech.test`;

  const registered = await request.post(`${API_URL}/auth/register`, {
    data: {
      fullName: 'Intruso E2E',
      email,
      password: OUTSIDER_PASSWORD,
      confirmPassword: OUTSIDER_PASSWORD,
    },
  });
  expect(registered.ok(), 'el intruso debe poder registrarse').toBeTruthy();
  const auth = await registered.json();

  // Su propia empresa: hace falta para que tenga un X-Company-Id válido y así
  // el test distinga "no eres miembro de ESA empresa" de "no eres miembro de
  // ninguna", que son fallos distintos.
  const company = await request.post(`${API_URL}/companies`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    data: { name: `E2E Intruso ${stamp}` },
  });
  expect(company.ok()).toBeTruthy();

  return {
    token: auth.accessToken,
    companyId: (await company.json()).id,
    userId: auth.user.id,
  };
}

test.describe('Aislamiento entre empresas', () => {
  test('un usuario ajeno no lee las ventas de otra empresa', async ({ request }) => {
    const victim = fixture();
    const outsider = await registerOutsider(request);

    // La cabecera apunta a la empresa de la víctima, el token es del intruso.
    const response = await request.get(`${API_URL}/sales`, {
      headers: {
        Authorization: `Bearer ${outsider.token}`,
        'X-Company-Id': victim.companyId,
      },
    });

    expect(response.status()).toBe(403);
  });

  test('un usuario ajeno no escribe en la empresa de otro', async ({ request }) => {
    const victim = fixture();
    const outsider = await registerOutsider(request);

    const response = await request.post(`${API_URL}/clients`, {
      headers: {
        Authorization: `Bearer ${outsider.token}`,
        'X-Company-Id': victim.companyId,
      },
      data: { name: 'Cliente inyectado' },
    });

    expect(response.status()).toBe(403);
  });

  test('el dueño legítimo sí entra', async ({ request }) => {
    const data = fixture();

    const response = await request.get(`${API_URL}/sales`, {
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        'X-Company-Id': data.companyId,
      },
    });

    expect(response.status()).toBe(200);
  });
});

test.describe('Cabecera X-Company-Id', () => {
  test('sin cabecera devuelve 400, no 500', async ({ request }) => {
    const data = fixture();
    const response = await request.get(`${API_URL}/sales`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    expect(response.status()).toBe(400);
  });

  test('una cabecera que no es UUID devuelve 400, no 500', async ({ request }) => {
    const data = fixture();
    const response = await request.get(`${API_URL}/sales`, {
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        'X-Company-Id': '../../etc/passwd',
      },
    });
    expect(response.status()).toBe(400);
  });

  test('si la ruta y la cabecera nombran empresas distintas, se rechaza', async ({ request }) => {
    const data = fixture();
    const otherId = '00000000-0000-4000-8000-000000000000';

    const response = await request.get(`${API_URL}/companies/${otherId}/roles`, {
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        'X-Company-Id': data.companyId,
      },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('Escalada de privilegios', () => {
  test('un rol no puede reescribirse con el comodín {all: true}', async ({ request }) => {
    const data = fixture();
    const headers = {
      Authorization: `Bearer ${data.accessToken}`,
      'X-Company-Id': data.companyId,
    };

    const roles = await request.get(`${API_URL}/companies/${data.companyId}/roles`, { headers });
    expect(roles.ok()).toBeTruthy();
    const [role] = await roles.json();
    expect(role, 'la empresa debe tener roles por defecto').toBeTruthy();

    const response = await request.patch(
      `${API_URL}/companies/${data.companyId}/roles/${role.id}`,
      { headers, data: { permissions: { all: true } } },
    );

    // 400 del schema. Aunque pasara, PermissionGuard ya no honra `all`.
    expect(response.status()).toBe(400);
  });

  test('un permiso desconocido no se cuela en el objeto de permisos', async ({ request }) => {
    const data = fixture();
    const headers = {
      Authorization: `Bearer ${data.accessToken}`,
      'X-Company-Id': data.companyId,
    };

    const response = await request.post(`${API_URL}/companies/${data.companyId}/roles`, {
      headers,
      data: {
        name: `E2E Rol ${Date.now()}`,
        permissions: { all: true, superadmin: true },
      },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('Validación de entrada', () => {
  test('el perfil rechaza campos que no son suyos', async ({ request }) => {
    const data = fixture();

    // `email` no está en el schema: cambiar la identidad no es editar el perfil.
    const response = await request.patch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
      data: { fullName: 'E2E', email: 'secuestrado@evil.test' },
    });

    expect(response.status()).toBe(400);
  });

  test('una venta con cantidades negativas se rechaza', async ({ request }) => {
    const data = fixture();

    const response = await request.post(`${API_URL}/sales`, {
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        'X-Company-Id': data.companyId,
      },
      data: {
        batchId: data.batchId,
        saleType: 'live',
        quantity: -10,
        totalAmount: -500,
      },
    });

    expect(response.status()).toBe(400);
  });

  test('un estado de lote inventado se rechaza', async ({ request }) => {
    const data = fixture();

    const response = await request.patch(`${API_URL}/batches/${data.batchId}/status`, {
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        'X-Company-Id': data.companyId,
      },
      data: { status: 'estado_inventado' },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('Contraseñas', () => {
  test('no se acepta una contraseña débil al registrarse', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/register`, {
      data: {
        fullName: 'Debil E2E',
        email: `e2e-debil-${Date.now()}@cryotech.test`,
        password: 'test12',
        confirmPassword: 'test12',
      },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('Rate limiting', () => {
  /**
   * El límite no se aplica a loopback fuera de producción, así que este test
   * finge venir de otra parte con `X-Forwarded-For`. Eso comprueba dos cosas a
   * la vez: que el límite existe, y que `trust proxy 1` está bien puesto — si
   * no lo estuviera, la API vería siempre la IP de nginx y un solo atacante
   * bloquearía a todo el mundo.
   */
  test('el login se corta tras varios intentos fallidos', async ({ request }) => {
    const attacker = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const statuses: number[] = [];

    for (let i = 0; i < 7; i++) {
      const response = await request.post(`${API_URL}/auth/login`, {
        headers: { 'X-Forwarded-For': attacker },
        data: { email: 'nadie@cryotech.test', password: 'ContraseñaMala1' },
        failOnStatusCode: false,
      });
      statuses.push(response.status());
    }

    expect(statuses.filter((s) => s === 401).length).toBeGreaterThan(0);
    expect(statuses).toContain(429);
    // Y el corte llega pronto, no al séptimo intento.
    expect(statuses.indexOf(429)).toBeLessThanOrEqual(5);
  });
});

test.describe('Cabeceras de seguridad', () => {
  test('la API responde con las cabeceras de helmet', async ({ request }) => {
    const response = await request.get(`${API_URL}/users/me`, { failOnStatusCode: false });
    const headers = response.headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['strict-transport-security']).toContain('max-age=');
    // helmet lo quita; anunciar el framework es reconocimiento gratis.
    expect(headers['x-powered-by']).toBeUndefined();
  });
});
