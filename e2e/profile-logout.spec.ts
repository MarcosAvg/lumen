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
	await expect(page.locator('#page-title')).toContainText('Hola,');
}

test('el perfil muestra la cuenta y permite cerrar sesión', async ({ page }) => {
	await ensureAdmin(page);

	await page.goto('/settings');
	await expect(page.locator('#page-title')).toHaveText('Perfil');
	await expect(page.getByText('Cuenta', { exact: true })).toBeVisible();
	await expect(page.locator('#contenido').getByText(ADMIN.username, { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Cerrar sesión' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
