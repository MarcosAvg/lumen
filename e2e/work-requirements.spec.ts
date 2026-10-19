import { expect, test, type Page } from '@playwright/test';
import { chooseCatalog, ensureAdmin } from './helpers';

async function createCatalog(page: Page, name: string, type = 'Otros') {
	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(name);
	await page.getByLabel('Tipo de catálogo').selectOption({ label: type });
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

async function createService(page: Page, name: string) {
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.locator('#contractId').selectOption({ label: 'General' });
	await page.getByLabel('Nombre', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();
}

async function openService(page: Page, name: string) {
	await page.goto('/admin/services');
	const link = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: name })
		.getByRole('link', { name: name });
	await page.goto((await link.getAttribute('href')) ?? '/admin/services');
}

test('al crear un trabajo se le pueden poner requisitos', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const unique = `${testInfo.project.name}-wr-${Date.now()}`;
	const catalog = `Requisitos ${unique}`;
	const antes = `Antes ${unique}`;
	const despues = `Después ${unique}`;
	const service = `Servicio ${unique}`;
	const work = `Trabajo ${unique}`;

	await ensureAdmin(page);
	await createCatalog(page, catalog, 'Requisitos');
	await openCatalog(page, catalog);
	await addItem(page, antes);
	await addItem(page, despues);

	await createService(page, service);
	await openService(page, service);

	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const dialog = page.getByRole('dialog');
	await page.getByRole('tab', { name: 'Nombre propio' }).click();
	await page.getByRole('dialog').getByText('Directo', { exact: true }).click();
	await page.locator('#work-name').fill(work);

	// Requisitos: dos desde catálogo y uno libre.
	await dialog.getByRole('button', { name: /^Requisitos/ }).click();
	const requirementComposer = dialog.locator(
		'[data-slot="draft-composer"][data-kind="requisitos"]'
	);
	await chooseCatalog(dialog, catalog);
	await dialog.getByRole('button', { name: 'Elegir requisitos…' }).click();
	for (const name of [antes, despues]) {
		await page.locator('[data-slot="command-item"]').filter({ hasText: name }).click();
	}
	await page.keyboard.press('Escape');
	await requirementComposer.getByRole('button', { name: /^Añadir \(\d+\)$/ }).click();
	await requirementComposer.getByRole('tab', { name: 'Nombre propio' }).click();
	await requirementComposer.getByLabel('Nombre del requisito').fill('Detalle libre');
	await requirementComposer.getByRole('button', { name: 'Añadir', exact: true }).click();

	await page.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	// Al abrir el trabajo, sus secciones ya están.
	const workLink = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: work })
		.getByRole('link', { name: work });
	await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');
	await expect(page.getByText(antes).first()).toBeVisible();
	await expect(page.getByText(despues).first()).toBeVisible();
	await expect(page.getByText('Detalle libre').first()).toBeVisible();

	// Eliminar un requisito pide confirmación en modal (se cancela).
	await page.getByRole('button', { name: 'Eliminar', exact: true }).first().click();
	const reqDialog = page.getByRole('alertdialog');
	await expect(reqDialog).toBeVisible();
	await expect(reqDialog.getByRole('button', { name: 'Eliminar requisito' })).toBeVisible();
	await reqDialog.getByRole('button', { name: 'Cancelar' }).click();
	await expect(reqDialog).toBeHidden();
});
