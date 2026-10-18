import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('el administrador elimina un usuario', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const username = `tmp${testInfo.project.name}${Date.now()}`.replace(/[^a-z0-9]/gi, '');
	const displayName = `Usuario ${testInfo.project.name}-${Date.now()}`;

	await ensureAdmin(page);
	await page.goto('/admin/users');

	// Crear usuario.
	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const createDialog = page.getByRole('dialog');
	await createDialog.locator('#new-displayName').fill(displayName);
	await createDialog.locator('#new-username').fill(username);
	await createDialog.locator('#new-password').fill('contrasena-segura');
	await createDialog.locator('#new-role').selectOption('technician');
	await createDialog.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(page.getByText('Usuario creado.')).toBeVisible();
	await expect(page.getByText(displayName).filter({ visible: true })).toBeVisible();

	// Eliminar con confirmación.
	const row = page.locator('tr, li').filter({ visible: true }).filter({ hasText: displayName });
	await row.getByRole('button', { name: 'Eliminar' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog.getByText(`¿Eliminar «${displayName}»?`)).toBeVisible();
	await dialog.getByRole('button', { name: 'Confirmar eliminación' }).click();

	// Excluye el toast de notificaciones, que también es un `li` con el nombre.
	await expect(page.locator('main tr, main li').filter({ hasText: displayName })).toHaveCount(0);
});
