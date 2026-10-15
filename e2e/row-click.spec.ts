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

test('la fila/tarjeta completa navega, no solo el nombre', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-row-${Date.now()}`;
	const serviceName = `Servicio ${unique}`;
	const description = `Descripción ${unique}`;

	await ensureAdmin(page);

	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByLabel('Descripción (opcional)').fill(description);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	// Pulso con coordenadas sobre la descripción (que no es el enlace): el
	// enlace estirado cubre toda la fila/tarjeta, así que el navegador enruta el
	// clic al overlay y navega. Uso `mouse.click` para no frenar por intercepción.
	const target = page.getByText(description).filter({ visible: true }).first();
	await target.scrollIntoViewIfNeeded();
	const box = await target.boundingBox();
	if (!box) throw new Error('No se pudo localizar la descripción.');
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page.getByRole('heading', { name: serviceName })).toBeVisible();
});
