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
	await expect(page.locator('#page-title')).toContainText('Hola,');
}

test('editar recursos en modal: servicio, catálogo, ítem y trabajo', async ({ page }, testInfo) => {
	test.setTimeout(120_000);
	const stamp = Date.now();
	const service = `Servicio ${testInfo.project.name}-${stamp}`;
	const serviceRenamed = `${service} editado`;
	const catalog = `Catálogo ${testInfo.project.name}-${stamp}`;
	const catalogRenamed = `${catalog} editado`;
	const item = `Ítem ${stamp}`;
	const itemRenamed = `${item} editado`;
	const work = `Trabajo ${stamp}`;
	const workRenamed = `${work} editado`;

	await ensureAdmin(page);

	// Servicio: editar desde la ficha.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(service);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();
	const serviceHref = await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: service })
		.getByRole('link', { name: service })
		.getAttribute('href');
	await page.goto(serviceHref ?? '/admin/services');

	await page.getByRole('button', { name: 'Editar servicio' }).click();
	const serviceDialog = page.getByRole('dialog');
	await serviceDialog.locator('#svc-name').fill(serviceRenamed);
	await serviceDialog.getByRole('button', { name: 'Guardar cambios' }).click();
	await expect(page.locator('#page-title')).toHaveText(serviceRenamed);

	// Trabajo: crear y editar desde la ficha.
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	await page.getByRole('tab', { name: 'Nombre propio' }).click();
	await page.locator('#work-mode').selectOption('direct');
	await page.locator('#work-name').fill(work);
	await page.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	const workHref = await page
		.getByRole('listitem')
		.filter({ hasText: work })
		.getByRole('link', { name: work })
		.getAttribute('href');
	await page.goto(workHref ?? '/dashboard');
	await page.getByRole('button', { name: 'Editar trabajo' }).click();
	const workDialog = page.getByRole('dialog');
	await workDialog.locator('#work-name').fill(workRenamed);
	await workDialog.getByRole('button', { name: 'Guardar' }).click();
	await expect(page.locator('#page-title')).toHaveText(workRenamed);

	// Catálogo: editar y renombrar un ítem.
	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(catalog);
	await page.getByRole('button', { name: 'Crear catálogo' }).click();
	await expect(page.getByText('Catálogo creado.')).toBeVisible();
	const catalogHref = await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: catalog })
		.getByRole('link', { name: catalog })
		.getAttribute('href');
	await page.goto(catalogHref ?? '/admin/catalogs');

	await page.getByRole('button', { name: 'Editar catálogo' }).click();
	const catalogDialog = page.getByRole('dialog');
	await catalogDialog.locator('#cat-name').fill(catalogRenamed);
	await catalogDialog.getByRole('button', { name: 'Guardar cambios' }).click();
	await expect(page.locator('#page-title')).toHaveText(catalogRenamed);

	await page.getByRole('button', { name: 'Nuevo ítem' }).click();
	await page.locator('#item-name').fill(item);
	await page.getByRole('button', { name: 'Añadir' }).click();
	const itemRow = page.locator('tr, li').filter({ visible: true }).filter({ hasText: item });
	await expect(itemRow).toBeVisible();

	await itemRow.getByRole('button', { name: 'Renombrar' }).click();
	const renameDialog = page.getByRole('dialog');
	await renameDialog.getByLabel('Nombre').fill(itemRenamed);
	await renameDialog.getByRole('button', { name: 'Guardar' }).click();
	await expect(page.getByText(itemRenamed).filter({ visible: true }).first()).toBeVisible();
});

test('desactivar usuario pide confirmación en modal', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const stamp = Date.now();
	const displayName = `Baja ${testInfo.project.name}-${stamp}`;
	const username = `baja${testInfo.project.name}${stamp}`.replace(/[^a-z0-9]/gi, '');

	await ensureAdmin(page);
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('#new-displayName').fill(displayName);
	await dialog.locator('#new-username').fill(username);
	await dialog.locator('#new-password').fill('contrasena-segura');
	await dialog.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(page.getByText('Usuario creado.')).toBeVisible();

	const row = page.locator('tr, li').filter({ visible: true }).filter({ hasText: displayName });
	await row.getByRole('button', { name: 'Desactivar' }).click();
	const confirm = page.getByRole('alertdialog');
	await expect(confirm.getByText('se cerrarán sus sesiones')).toBeVisible();
	await confirm.getByRole('button', { name: 'Cancelar' }).click();
	await expect(confirm).toBeHidden();
	// Sigue activo: no aparece la insignia de inactivo.
	await expect(row.getByText('Inactivo')).toHaveCount(0);
});
