import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('el botón «Volver» de la cabecera lleva al padre', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-back-${Date.now()}`;
	const serviceName = `Servicio ${unique}`;
	const workName = `Trabajo ${unique}`;

	await ensureAdmin(page);

	// Crear un servicio.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.locator('#contractId').selectOption({ label: 'General' });
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	const serviceLink = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: serviceName })
		.getByRole('link', { name: serviceName })
		.first();
	await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');

	// Crear un trabajo directo con nombre propio.
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('tab', { name: 'Nombre propio' }).click();
	await dialog.getByText('Directo', { exact: true }).click();
	await dialog.locator('#work-name').fill(workName);
	await dialog.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	// Abrir la ficha del trabajo.
	const workLink = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: workName })
		.getByRole('link', { name: workName })
		.first();
	await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');

	// «Volver» → ficha del servicio.
	await page.getByRole('link', { name: `Volver a ${serviceName}` }).click();
	await expect(page).toHaveURL(/\/services\/[0-9a-f-]{36}$/);

	// «Volver» → lista de servicios (admin).
	await page.getByRole('link', { name: 'Volver a Servicios' }).click();
	await expect(page).toHaveURL(/\/admin\/services$/);
});
