import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

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
