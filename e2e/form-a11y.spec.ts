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

test('los errores de campo se asocian al control (aria-invalid/aria-describedby)', async ({
	page
}, testInfo) => {
	test.setTimeout(90_000);
	const username = `val${testInfo.project.name}${Date.now()}`.replace(/[^a-z0-9]/gi, '');

	await ensureAdmin(page);
	await page.goto('/admin/users');

	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('#new-displayName').fill('Validación');
	await dialog.locator('#new-username').fill(username);
	// Contraseña demasiado corta: error de validación del campo.
	await dialog.locator('#new-password').fill('corta');
	await dialog.getByRole('button', { name: 'Crear usuario' }).click();

	const input = dialog.locator('#new-password');
	await expect(input).toHaveAttribute('aria-invalid', 'true');
	const describedBy = await input.getAttribute('aria-describedby');
	expect(describedBy).toBeTruthy();
	await expect(dialog.locator(`#${describedBy}`)).toBeVisible();
});
