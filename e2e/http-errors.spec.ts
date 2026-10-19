import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

const MISSING = '00000000-0000-4000-8000-000000000000';

test('recursos inexistentes devuelven 404 (no 500)', async ({ page }) => {
	await ensureAdmin(page);

	for (const path of [
		`/services/${MISSING}`,
		`/works/${MISSING}`,
		`/elements/${MISSING}`,
		`/submissions/${MISSING}`,
		`/admin/services/${MISSING}`,
		`/admin/catalogs/${MISSING}`
	]) {
		const response = await page.request.get(path);
		expect(response.status(), `${path} debería ser 404`).toBe(404);
	}
});

test('los errores muestran una vista propia en español', async ({ page }) => {
	await ensureAdmin(page);

	// 404 dentro de la app (recurso fuera de ámbito o inexistente).
	await page.goto(`/services/${MISSING}`);
	await expect(page.getByRole('heading', { name: 'No encontrado' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Ir al inicio' })).toBeVisible();

	// 404 fuera del shell (ruta desconocida).
	await page.goto('/ruta-que-no-existe');
	await expect(page.getByRole('heading', { name: 'No encontrado' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});
