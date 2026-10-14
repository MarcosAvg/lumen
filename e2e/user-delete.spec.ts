import { expect, test, type Page } from '@playwright/test';

const ADMIN = { username: 'admin', password: 'contrasena-segura', displayName: 'Admin E2E' };

async function ensureAdmin(page: Page) {
	await page.goto('/');
	if (page.url().includes('/setup')) {
		await page.getByLabel('Nombre visible').fill(ADMIN.displayName);
		await page.getByLabel('Usuario').fill(ADMIN.username);
		await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password);
		await page.getByLabel('Repetir contraseña').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Crear administrador' }).click();
	} else {
		await page.getByLabel('Usuario').fill(ADMIN.username);
		await page.getByLabel('Contraseña').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Entrar' }).click();
	}
	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
}

test('el administrador elimina un usuario', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const username = `tmp${testInfo.project.name}${Date.now()}`.replace(/[^a-z0-9]/gi, '');
	const displayName = `Usuario ${testInfo.project.name}-${Date.now()}`;

	await ensureAdmin(page);
	await page.goto('/admin/users');

	// Crear usuario.
	await page.locator('#new-displayName').fill(displayName);
	await page.locator('#new-username').fill(username);
	await page.locator('#new-password').fill('contrasena-segura');
	await page.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(page.getByText('Usuario creado.')).toBeVisible();
	await expect(page.getByText(displayName)).toBeVisible();

	// Eliminar con confirmación.
	const row = page.getByRole('listitem').filter({ hasText: displayName });
	await row.getByRole('button', { name: 'Eliminar' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog.getByText(`¿Eliminar «${displayName}»?`)).toBeVisible();
	await dialog.getByRole('button', { name: 'Confirmar eliminación' }).click();

	await expect(page.getByText(displayName)).toHaveCount(0);
});
