import { expect, test } from '@playwright/test';
import { chooseCatalog, ensureAdmin } from './helpers';

test('catálogo: búsqueda de ítems y selección en dos pasos', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-cat-${Date.now()}`;
	const catalogName = `Catálogo ${unique}`;
	const itemName = `UMA ${unique}`;
	const serviceName = `Servicio ${unique}`;

	await ensureAdmin(page);

	// Crear catálogo y un ítem.
	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(catalogName);
	await page.getByRole('button', { name: 'Crear catálogo' }).click();
	await expect(page.getByText('Catálogo creado.')).toBeVisible();

	await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: catalogName })
		.getByRole('link', { name: catalogName })
		.filter({ visible: true })
		.first()
		.click();
	await page.getByRole('button', { name: 'Nuevo ítem' }).click();
	await page.locator('#item-name').fill(itemName);
	await page.getByRole('button', { name: 'Añadir' }).click();
	await expect(page.getByText(itemName).filter({ visible: true }).first()).toBeVisible();

	// La búsqueda de ítems filtra.
	await page.getByPlaceholder('Buscar ítem…').fill('no-existe-zzz');
	await page.getByRole('button', { name: 'Buscar' }).click();
	await expect(page.getByText('Sin ítems que coincidan con la búsqueda.')).toBeVisible();

	// Crear servicio y trabajo eligiendo el ítem con el combobox.
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
		.filter({ visible: true })
		.first();
	await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByText('Directo', { exact: true }).click();
	// Paso 1: catálogo. Paso 2: ítem del catálogo (con búsqueda).
	await chooseCatalog(page, dialog, catalogName);
	await dialog.getByRole('button', { name: 'Elige ítem…' }).click();
	await page.getByPlaceholder('Buscar ítem…').fill(itemName);
	const option = page.locator('[data-slot="command-item"]').filter({ hasText: itemName });
	await expect(option).toBeVisible();
	await option.click();
	await dialog.getByRole('button', { name: 'Crear trabajo' }).click();

	await expect(page.getByText('Trabajo creado.')).toBeVisible();
	await expect(
		page.locator('tr, li').filter({ visible: true }).filter({ hasText: itemName }).first()
	).toBeVisible();
});
