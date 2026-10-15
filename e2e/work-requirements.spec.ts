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

async function createCatalog(page: Page, name: string, purpose?: 'requirements') {
	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(name);
	if (purpose) await page.getByLabel('Propósito').selectOption(purpose);
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
	await page.getByLabel('Nuevo ítem').fill(name);
	await page.getByRole('button', { name: 'Añadir' }).click();
	await expect(page.getByRole('textbox', { name: 'Nombre del ítem' }).last()).toHaveValue(name);
}

async function createService(page: Page, name: string) {
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
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
	await createCatalog(page, catalog, 'requirements');
	await openCatalog(page, catalog);
	await addItem(page, antes);
	await addItem(page, despues);

	await createService(page, service);
	await openService(page, service);

	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const dialog = page.getByRole('dialog');
	await page.getByRole('tab', { name: 'Nombre propio' }).click();
	await page.locator('#work-mode').selectOption('direct');
	await page.locator('#work-name').fill(work);

	// Requisitos: dos desde catálogo y uno libre.
	await dialog.getByLabel('Catálogo').selectOption({ label: catalog });
	await dialog.getByRole('button', { name: 'Elegir requisitos…' }).click();
	for (const name of [antes, despues]) {
		await page.locator('[data-slot="command-item"]').filter({ hasText: name }).click();
	}
	await page.keyboard.press('Escape');
	await dialog.getByRole('button', { name: /^Agregar \(\d+\)$/ }).click();
	await dialog.locator('#requirement-name-draft').fill('Detalle libre');
	await dialog.getByRole('button', { name: 'Agregar', exact: true }).last().click();

	await page.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	// Al abrir el trabajo, sus secciones ya están.
	const workLink = page
		.getByRole('listitem')
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

test('la generación en lote aplica requisitos', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const unique = `${testInfo.project.name}-gr-${Date.now()}`;
	const workCatalog = `Trabajos ${unique}`;
	const workItem = `Trabajo ${unique}`;
	const reqCatalog = `Requisitos ${unique}`;
	const reqItem = `Antes ${unique}`;
	const service = `Servicio ${unique}`;

	await ensureAdmin(page);
	await createCatalog(page, workCatalog);
	await openCatalog(page, workCatalog);
	await addItem(page, workItem);
	await createCatalog(page, reqCatalog, 'requirements');
	await openCatalog(page, reqCatalog);
	await addItem(page, reqItem);

	await createService(page, service);
	await openService(page, service);

	await page.getByRole('button', { name: 'Generar en lote' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Catálogo').first().selectOption({ label: workCatalog });
	await dialog.getByRole('button', { name: 'Elegir trabajos…' }).click();
	await page.locator('[data-slot="command-item"]').filter({ hasText: workItem }).click();

	await dialog.getByLabel('Catálogo').last().selectOption({ label: reqCatalog });
	await dialog.getByRole('button', { name: 'Elegir requisitos…' }).click();
	await page.locator('[data-slot="command-item"]').filter({ hasText: reqItem }).click();
	await page.keyboard.press('Escape');
	await dialog.getByRole('button', { name: /^Agregar \(\d+\)$/ }).click();

	await dialog.getByRole('button', { name: 'Previsualizar' }).click();
	await dialog.getByRole('button', { name: 'Aplicar generación' }).click();
	await expect(page.getByText(/Estructura generada/)).toBeVisible();

	// El trabajo generado ya trae el requisito.
	const workLink = page
		.getByRole('listitem')
		.filter({ hasText: workItem })
		.getByRole('link', { name: workItem });
	await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');
	await expect(page.getByText(reqItem).first()).toBeVisible();
});
