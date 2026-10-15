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
		await page.getByLabel('Nuevo ítem').fill(name);
		await page.getByRole('button', { name: 'Añadir' }).click();
		await expect(page.getByRole('textbox', { name: 'Nombre del ítem' }).last()).toHaveValue(name);
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
		.getByRole('listitem')
		.filter({ hasText: workName })
		.getByRole('link', { name: workName });
	await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');

	// Alta desde el catálogo de requisitos (varios a la vez).
	await expect(page.getByText('Añadir desde catálogo de requisitos')).toBeVisible();
	await page.getByLabel('Catálogo').selectOption({ label: catalogName });
	await page.getByRole('button', { name: 'Elegir requisitos…' }).click();
	for (const name of [antes, despues]) {
		await page.locator('[data-slot="command-item"]').filter({ hasText: name }).click();
	}
	await page.getByText('Añadir desde catálogo de requisitos').click();
	await page.getByRole('button', { name: 'Añadir seleccionados' }).click();

	await expect(page.getByText(antes).first()).toBeVisible();
	await expect(page.getByText(despues).first()).toBeVisible();
});
