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
	} else if (page.url().includes('/login')) {
		await page.getByLabel('Usuario').fill(ADMIN.username);
		await page.getByLabel('Contraseña').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Entrar' }).click();
	}
	await expect(page.locator('#page-title')).toContainText('Hola,');
}

test('el título de la vista vive en la cabecera, no en el contenido', async ({ page }) => {
	await ensureAdmin(page);

	for (const [path, title] of [
		['/dashboard', null],
		['/search', 'Buscar'],
		['/notifications', 'Notificaciones'],
		['/reviews', 'Revisiones'],
		['/settings', 'Perfil'],
		['/services', 'Servicios'],
		['/admin/services', 'Servicios'],
		['/admin/users', 'Usuarios'],
		['/admin/catalogs', 'Catálogos']
	] as const) {
		await page.goto(path);
		if (title) {
			await expect(page.locator('#page-title')).toHaveText(title);
		} else {
			await expect(page.locator('#page-title')).toContainText('Hola,');
		}
		// El contenido de la página ya no repite el `h1`.
		await expect(page.locator('#contenido h1')).toHaveCount(0);
	}
});
