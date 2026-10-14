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
		.getByRole('listitem')
		.filter({ hasText: catalogName })
		.getByRole('link', { name: 'Ver ítems' })
		.click();
	await page.getByLabel('Nuevo ítem').fill(itemName);
	await page.getByRole('button', { name: 'Añadir' }).click();
	await expect(page.getByRole('textbox', { name: 'Nombre del ítem' }).first()).toHaveValue(
		itemName
	);

	// La búsqueda de ítems filtra.
	await page.getByPlaceholder('Buscar ítem…').fill('no-existe-zzz');
	await page.getByRole('button', { name: 'Buscar' }).click();
	await expect(page.getByText('Sin ítems que coincidan con la búsqueda.')).toBeVisible();

	// Crear servicio y trabajo eligiendo el ítem con el combobox.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	const serviceLink = page
		.getByRole('listitem')
		.filter({ hasText: serviceName })
		.getByRole('link', { name: 'Ver servicio' });
	await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const dialog = page.getByRole('dialog');
	// Paso 1: catálogo. Paso 2: ítem del catálogo (con búsqueda).
	await dialog.getByLabel('Catálogo').first().selectOption({ label: catalogName });
	await dialog.getByRole('button', { name: 'Elige ítem…' }).click();
	await page.getByPlaceholder('Buscar ítem…').fill(itemName);
	const option = page.locator('[data-slot="command-item"]').filter({ hasText: itemName });
	await expect(option).toBeVisible();
	await option.click();
	await dialog.getByRole('button', { name: 'Crear trabajo' }).click();

	await expect(page.getByText('Trabajo creado.')).toBeVisible();
	await expect(page.getByRole('listitem').filter({ hasText: itemName }).first()).toBeVisible();
});
