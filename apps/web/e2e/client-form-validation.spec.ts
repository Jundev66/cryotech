import { test, expect } from '@playwright/test';

test.describe.serial('Validación exhaustiva de formulario de Clientes', () => {
  const timestamp = Date.now();
  const validClientName = `Cliente Test ${timestamp}`;
  const validPhone = '04141234567';
  const validEmail = `cliente_${timestamp}@test.com`;
  const validAddress = 'Av. Principal #123, Galpón 4';

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/clients');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  });

  test('validación de campos obligatorios y formato en formulario de creación', async ({ page }) => {
    // 1. Abrir diálogo de creación
    const newBtn = page.getByRole('button', { name: 'Nuevo Cliente' });
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nuevo Cliente' })).toBeVisible();

    const saveBtn = page.getByRole('button', { name: 'Crear' });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled();

    // 2. Intentar guardar con campos vacíos -> Debería mostrar error en 'Nombre'
    await saveBtn.click();
    await expect(page.getByText('Nombre es requerido')).toBeVisible();

    // 3. Validar longitud mínima de 'Nombre' (< 2 caracteres)
    const nameInput = page.getByLabel('Nombre');
    await nameInput.fill('A');
    await saveBtn.click();
    await expect(page.getByText('Nombre es requerido')).toBeVisible();

    // 4. Validar formato de email inválido
    const emailInput = page.getByLabel('Email');
    await emailInput.fill('correo-invalido');
    await saveBtn.click();
    await expect(page.getByText('Email inválido')).toBeVisible();

    // 5. Corregir email y completar todos los campos válidos
    await nameInput.fill(validClientName);
    await emailInput.fill(validEmail);
    const phoneInput = page.getByLabel('Telefono');
    await phoneInput.fill(validPhone);
    const addressInput = page.getByLabel('Direccion');
    await addressInput.fill(validAddress);

    // Los mensajes de error deben haber desaparecido o desaparecer al guardar
    await saveBtn.click();

    // 6. Validar que el diálogo se cierra y se ve el toast / fila en tabla
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('cell', { name: validClientName })).toBeVisible();
    await expect(page.getByRole('cell', { name: validPhone })).toBeVisible();
    await expect(page.getByRole('cell', { name: validEmail })).toBeVisible();
  });

  test('validación de edición de campos y guardado actualizado', async ({ page }) => {
    // Buscar la fila del cliente creado
    const row = page.getByRole('row', { name: new RegExp(validClientName) });
    await expect(row).toBeVisible();

    // Abrir formulario de edición haciendo clic en el botón de edición
    await row.getByRole('button').first().click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editar Cliente' })).toBeVisible();

    const nameInput = page.getByLabel('Nombre');
    const phoneInput = page.getByLabel('Telefono');
    const emailInput = page.getByLabel('Email');
    const addressInput = page.getByLabel('Direccion');
    const updateBtn = page.getByRole('button', { name: 'Actualizar' });

    // Verificar que los campos vengan pre-llenados con la información anterior
    await expect(nameInput).toHaveValue(validClientName);
    await expect(phoneInput).toHaveValue(validPhone);
    await expect(emailInput).toHaveValue(validEmail);
    await expect(addressInput).toHaveValue(validAddress);

    // Probar validación al limpiar el nombre en edición
    await nameInput.fill('');
    await updateBtn.click();
    await expect(page.getByText('Nombre es requerido')).toBeVisible();

    // Probar email inválido en edición
    await emailInput.fill('email-malo-edit');
    await updateBtn.click();
    await expect(page.getByText('Email inválido')).toBeVisible();

    // Ahora actualizar con valores válidos modificados
    const updatedName = `${validClientName} Modificado`;
    const updatedPhone = '04249876543';
    const updatedEmail = `updated_${timestamp}@test.com`;
    const updatedAddress = 'Zona Industrial Lote 9';

    await nameInput.fill(updatedName);
    await phoneInput.fill(updatedPhone);
    await emailInput.fill(updatedEmail);
    await addressInput.fill(updatedAddress);

    await updateBtn.click();

    // Validar cierre y reflejo de cambios en la tabla
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();
    await expect(page.getByRole('cell', { name: updatedPhone })).toBeVisible();
    await expect(page.getByRole('cell', { name: updatedEmail })).toBeVisible();
  });
});
