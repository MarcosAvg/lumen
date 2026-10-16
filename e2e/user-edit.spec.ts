import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('el administrador edita datos, rol y contraseña en el modal', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const stamp = Date.now();
	const username = `edit${testInfo.project.name}${stamp}`.replace(/[^a-z0-9]/gi, '');
	const displayName = `Editar ${testInfo.project.name}-${stamp}`;
	const newName = `${displayName} renombrado`;

	await ensureAdmin(page);
	await page.goto('/admin/users');

	// Crear usuario.
	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const createDialog = page.getByRole('dialog');
	await createDialog.locator('#new-displayName').fill(displayName);
	await createDialog.locator('#new-username').fill(username);
	await createDialog.locator('#new-password').fill('contrasena-segura');
	await createDialog.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(page.getByText('Usuario creado.')).toBeVisible();

	// Editar datos (nombre y usuario).
	let row = page.locator('tr, li').filter({ visible: true }).filter({ hasText: displayName });
	await row.getByRole('button', { name: 'Editar' }).click();
	let dialog = page.getByRole('dialog');
	await dialog.locator('#edit-displayName').fill(newName);
	await dialog.locator('#edit-username').fill(`${username}x`);
	await dialog.getByRole('button', { name: 'Guardar datos' }).click();
	await expect(page.getByText('Usuario actualizado.')).toBeVisible();
	await expect(page.getByText(newName).filter({ visible: true })).toBeVisible();

	// Cambiar rol.
	row = page.locator('tr, li').filter({ visible: true }).filter({ hasText: newName });
	await row.getByRole('button', { name: 'Editar' }).click();
	dialog = page.getByRole('dialog');
	await dialog.locator('#edit-role').selectOption('supervisor');
	await dialog.getByRole('button', { name: 'Cambiar rol' }).click();
	await expect(page.getByText('Rol actualizado.')).toBeVisible();
	await expect(row.getByText('Supervisor')).toBeVisible();

	// Restablecer contraseña.
	await row.getByRole('button', { name: 'Editar' }).click();
	dialog = page.getByRole('dialog');
	await dialog.locator('#edit-password').fill('otra-contrasena-segura');
	await dialog.getByRole('button', { name: 'Restablecer contraseña' }).click();
	await expect(page.getByText(/Contraseña restablecida/)).toBeVisible();
});
