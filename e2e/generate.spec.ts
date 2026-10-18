import { expect, test } from '@playwright/test';
import { chooseCatalog, ensureAdmin } from './helpers';

test('generación en lote desde un modal', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const unique = `${testInfo.project.name}-gen-${Date.now()}`;
	const catalogName = `Catálogo ${unique}`;
	const itemName = `Trabajo ${unique}`;
	const serviceName = `Servicio ${unique}`;

	await ensureAdmin(page);

	// Catálogo con un ítem.
	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(catalogName);
	await page.getByRole('button', { name: 'Crear catálogo' }).click();
	await expect(page.getByText('Catálogo creado.')).toBeVisible();
	// En cada proyecto hay una tarjeta (móvil) y una fila (escritorio) con el
	// mismo texto; se elige solo el contenedor visible del breakpoint actual.
	const listItem = testInfo.project.name === 'movil' ? page.locator('li') : page.locator('tr');
	await listItem
		.filter({ hasText: catalogName })
		.getByRole('link', { name: catalogName })
		.first()
		.click();
	await page.getByRole('button', { name: 'Nuevo ítem' }).click();
	await page.locator('#item-name').fill(itemName);
	await page.getByRole('button', { name: 'Añadir' }).click();

	// Servicio.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.locator('#contractId').selectOption({ label: 'General' });
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();
	const serviceLink = listItem
		.filter({ hasText: serviceName })
		.getByRole('link', { name: serviceName })
		.first();
	await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');

	// Generar en lote desde el modal.
	await page.getByRole('button', { name: 'Generar en lote' }).click();
	const dialog = page.getByRole('dialog');
	await chooseCatalog(page, dialog, catalogName);
	await dialog.getByRole('button', { name: 'Elegir trabajos…' }).click();
	const option = page.locator('[data-slot="command-item"]').filter({ hasText: itemName });
	await expect(option).toBeVisible();
	await option.click();
	await dialog.getByRole('button', { name: 'Previsualizar' }).click();

	await expect(dialog.getByRole('textbox', { name: 'Nombre del trabajo' }).first()).toHaveValue(
		itemName
	);
	await dialog.getByRole('button', { name: 'Aplicar generación' }).click();

	await expect(page.getByText(/Estructura generada/)).toBeVisible();
	await expect(page.getByText(itemName).filter({ visible: true }).first()).toBeVisible();
});
