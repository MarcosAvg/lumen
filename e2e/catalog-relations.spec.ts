import { expect, test, type Page } from '@playwright/test';
import { chooseCatalog, ensureAdmin } from './helpers';

async function createCatalog(page: Page, name: string) {
	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Crear catálogo' }).click();
	await expect(page.getByText('Catálogo creado.')).toBeVisible();
}

async function openCatalog(page: Page, name: string) {
	await page.goto('/admin/catalogs');
	await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: name })
		.getByRole('link', { name: name })
		.click();
}

async function addItem(page: Page, name: string) {
	await page.getByRole('button', { name: 'Nuevo ítem' }).click();
	await page.locator('#item-name').fill(name);
	await page.getByRole('button', { name: 'Añadir' }).click();
	await expect(
		page.getByText(name, { exact: true }).filter({ visible: true }).first()
	).toBeVisible();
}

test('catálogo: relacionar por lote y gestionar por ítem', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const unique = `${testInfo.project.name}-rel-${Date.now()}`;
	const pisos = `Pisos ${unique}`;
	const edificios = `Edificios ${unique}`;
	const piso1 = `Piso 1 ${unique}`;
	const piso2 = `Piso 2 ${unique}`;
	const piso3 = `Piso 3 ${unique}`;
	const edificio = `Edificio A ${unique}`;

	await ensureAdmin(page);

	// Dos catálogos con sus ítems.
	await createCatalog(page, pisos);
	await openCatalog(page, pisos);
	await addItem(page, piso1);
	await addItem(page, piso2);
	await addItem(page, piso3);

	await createCatalog(page, edificios);
	await openCatalog(page, edificios);
	await addItem(page, edificio);

	// Volver a Pisos y relacionar en lote: todos los pisos → Edificio A.
	await openCatalog(page, pisos);
	await page.getByRole('button', { name: 'Relacionar en lote' }).click();
	const batch = page.getByRole('dialog');
	await expect(batch.getByRole('heading', { name: 'Relacionar en lote' })).toBeVisible();
	await batch.getByText('Este catálogo → otro', { exact: true }).click();
	await chooseCatalog(page, batch, pisos, 0);

	await batch.getByRole('button', { name: 'Elegir ítems…' }).click();
	for (const name of [piso1, piso2, piso3]) {
		await page.locator('[data-slot="command-item"]').filter({ hasText: name }).click();
	}
	// Cierra el popover de multiselección.
	await page.keyboard.press('Escape');

	await chooseCatalog(page, batch, edificios, 1);
	await batch.getByRole('button', { name: /^Elige ítem/ }).click();
	await page.locator('[data-slot="command-item"]').filter({ hasText: edificio }).click();

	await expect(batch.getByText(/Se crearán/)).toContainText('3');
	await batch.getByRole('button', { name: 'Relacionar' }).click();

	// Tres relaciones nuevas en el resumen.
	await expect(page.getByRole('listitem').filter({ hasText: edificio })).toHaveCount(3);
	await expect(page.getByRole('button', { name: 'Relaciones (1)' })).toHaveCount(3);

	// Gestionar por ítem: abrir el modal del primer piso y quitar su relación.
	const pisoRow = page.locator('tr, li').filter({ visible: true }).filter({ hasText: piso1 });
	await pisoRow.getByRole('button', { name: 'Relaciones (1)' }).click();
	const itemDialog = page.getByRole('dialog');
	await expect(itemDialog.getByRole('heading', { name: `Relaciones de «${piso1}»` })).toBeVisible();
	await expect(itemDialog.getByText(edificio)).toBeVisible();

	await itemDialog.getByRole('button', { name: 'Quitar' }).click();
	await expect(itemDialog.getByText('Sin relaciones.').first()).toBeVisible();
	await itemDialog
		.locator('[data-slot="dialog-footer"]')
		.getByRole('button', { name: 'Cerrar' })
		.click();

	// Quedan dos relaciones.
	await expect(page.getByRole('listitem').filter({ hasText: edificio })).toHaveCount(2);
});
