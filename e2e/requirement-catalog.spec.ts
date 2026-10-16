import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('catálogo de requisitos: separación por tipo y alta en la evidencia', async ({
	page
}, testInfo) => {
	test.setTimeout(90_000);
	const unique = `${testInfo.project.name}-req-${Date.now()}`;
	const catalogName = `Requisitos ${unique}`;
	const antes = `Antes ${unique}`;
	const despues = `Después ${unique}`;
	const serviceName = `Servicio ${unique}`;
	const workName = `Trabajo ${unique}`;

	await ensureAdmin(page);

	// Catálogo de tipo «Requisitos» con dos ítems.
	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(catalogName);
	await page.getByLabel('Propósito').selectOption('requirements');
	await page.getByRole('button', { name: 'Crear catálogo' }).click();
	await expect(page.getByText('Catálogo creado.')).toBeVisible();

	// Las pestañas separan los tipos y el catálogo aparece en «Requisitos».
	await page.getByRole('tab', { name: /^Requisitos \(/ }).click();
	await expect(page.getByText(catalogName).filter({ visible: true })).toBeVisible();

	await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: catalogName })
		.getByRole('link', { name: catalogName })
		.click();
	for (const name of [antes, despues]) {
		await page.getByRole('button', { name: 'Nuevo ítem' }).click();
		await page.locator('#item-name').fill(name);
		await page.getByRole('button', { name: 'Añadir' }).click();
		await expect(
			page.getByText(name, { exact: true }).filter({ visible: true }).first()
		).toBeVisible();
	}

	// Servicio con trabajo directo.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	const serviceLink = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: serviceName })
		.getByRole('link', { name: serviceName });
	await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	await page.getByRole('tab', { name: 'Nombre propio' }).click();
	await page.locator('#work-mode').selectOption('direct');
	await page.locator('#work-name').fill(workName);
	await page.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	const workLink = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: workName })
		.getByRole('link', { name: workName });
	await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');

	// Alta desde el catálogo de requisitos (varios a la vez), en el modal.
	await page.getByRole('button', { name: 'Nuevo requisito' }).click();
	const reqDialog = page.getByRole('dialog');
	await reqDialog.getByRole('tab', { name: 'Desde catálogo' }).click();
	await reqDialog.getByLabel('Catálogo').selectOption({ label: catalogName });
	await reqDialog.getByRole('button', { name: 'Elegir requisitos…' }).click();
	for (const name of [antes, despues]) {
		await page.locator('[data-slot="command-item"]').filter({ hasText: name }).click();
	}
	await reqDialog.getByRole('heading', { name: 'Añadir requisitos' }).click();
	await reqDialog.getByRole('button', { name: 'Añadir seleccionados' }).click();

	await expect(page.getByText(antes).first()).toBeVisible();
	await expect(page.getByText(despues).first()).toBeVisible();
});
