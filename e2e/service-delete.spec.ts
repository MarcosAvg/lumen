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

test('el administrador elimina un servicio desde su página', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const serviceName = `Servicio borrar ${testInfo.project.name}-${Date.now()}`;

	await ensureAdmin(page);

	// Crear servicio y abrirlo.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	const serviceLink = page
		.getByRole('listitem')
		.filter({ hasText: serviceName })
		.getByRole('link', { name: 'Ver servicio' });
	await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');
	await expect(page.getByRole('heading', { name: serviceName })).toBeVisible();

	// Eliminar con confirmación.
	await page.getByRole('button', { name: 'Eliminar servicio' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog.getByText(`¿Eliminar «${serviceName}»?`)).toBeVisible();
	await dialog.getByRole('button', { name: 'Confirmar eliminación' }).click();

	// Redirige a Inicio y el servicio ya no existe.
	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
	await page.goto('/admin/services');
	await expect(page.getByText(serviceName)).toHaveCount(0);
});
