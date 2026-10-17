import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('la búsqueda filtra por tipo y por servicio en servidor', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const unique = `Filtro${testInfo.project.name}${Date.now()}`.replace(/[^a-z0-9]/gi, '');
	const serviceName = `${unique} Servicio`;
	const workName = `${unique} Trabajo`;

	await ensureAdmin(page);

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
		.getByRole('link', { name: serviceName });
	await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	await page.getByRole('tab', { name: 'Nombre propio' }).click();
	await page.getByRole('dialog').getByText('Directo', { exact: true }).click();
	await page.locator('#work-name').fill(workName);
	await page.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	await page.goto('/search');
	await page.getByPlaceholder('Nombre de servicio, trabajo o elemento').fill(unique);
	await page.getByRole('button', { name: 'Buscar' }).click();
	await expect(page.getByRole('heading', { name: /^Servicios \(/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: /^Trabajos \(/ })).toBeVisible();

	// Solo trabajos.
	await page.locator('#filter-type').selectOption('work');
	await page.getByRole('button', { name: 'Aplicar filtros' }).click();
	await expect(page.getByRole('heading', { name: /^Trabajos \(/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: /^Servicios \(/ })).toHaveCount(0);

	// Acotado a un servicio concreto.
	await page.locator('#filter-service').selectOption({ label: serviceName });
	await page.getByRole('button', { name: 'Aplicar filtros' }).click();
	await expect(page.getByText(workName).filter({ visible: true }).first()).toBeVisible();
});
