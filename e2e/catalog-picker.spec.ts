import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('catálogo: búsqueda de ítems y selección en dos pasos @mobile', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-cat-${Date.now()}`;
	const catalogName = `Catálogo ${unique}`;
	const itemName = `UMA ${unique}`;
	const serviceName = `Servicio ${unique}`;
	const areasCatalog = `Áreas ${unique}`;

	await ensureAdmin(page);

	// Crear catálogo y un ítem.
	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(catalogName);
	await page.getByLabel('Tipo de catálogo').selectOption({ label: 'Otros' });
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

	// Segundo catálogo de otro tipo para comprobar el filtro.
	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(areasCatalog);
	await page.getByLabel('Tipo de catálogo').selectOption({ label: 'Áreas' });
	await page.getByRole('button', { name: 'Crear catálogo' }).click();
	await expect(page.getByText('Catálogo creado.')).toBeVisible();

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
	// Tipo y catálogo en selects inline; después, el ítem con búsqueda.
	const picker = dialog.locator('[data-slot="catalog-picker"]').first();
	const typeSelect = picker.locator('[data-slot="catalog-type-select"]');
	const catalogSelect = picker.locator('[data-slot="catalog-select"]');
	await expect(typeSelect).toBeVisible();
	await typeSelect.selectOption({ label: 'Áreas' });
	await expect(catalogSelect.getByRole('option', { name: areasCatalog })).toHaveCount(1);
	await expect(catalogSelect.getByRole('option', { name: catalogName })).toHaveCount(0);
	await typeSelect.selectOption({ label: 'Otros' });
	await expect(catalogSelect.getByRole('option', { name: catalogName })).toHaveCount(1);
	await expect(catalogSelect.getByRole('option', { name: areasCatalog })).toHaveCount(0);
	await catalogSelect.selectOption({ label: catalogName });
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
