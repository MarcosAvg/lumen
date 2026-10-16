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

test('trabajo dividido: crear con elementos y añadir desde el trabajo', async ({
	page
}, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-div-${Date.now()}`;
	const serviceName = `Servicio ${unique}`;
	const workName = `Piso ${unique}`;

	await ensureAdmin(page);

	// Crear servicio.
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

	// Crear trabajo dividido con dos elementos (por nombre propio).
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('#work-mode').selectOption('divided');
	await dialog.getByRole('tab', { name: 'Nombre propio' }).click();
	await dialog.locator('#work-name').fill(workName);

	await dialog.locator('#element-name-draft').fill('UMA 1');
	await dialog
		.locator('#element-name-draft')
		.locator('xpath=../..')
		.getByRole('button', { name: 'Agregar', exact: true })
		.click();
	await dialog.locator('#element-name-draft').fill('UMA 2');
	await dialog
		.locator('#element-name-draft')
		.locator('xpath=../..')
		.getByRole('button', { name: 'Agregar', exact: true })
		.click();
	await dialog.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	// Abrir el trabajo y comprobar los dos elementos.
	const workLink = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: workName })
		.getByRole('link', { name: workName });
	await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');
	await expect(page.getByText('UMA 1').filter({ visible: true }).first()).toBeVisible();
	await expect(page.getByText('UMA 2').filter({ visible: true }).first()).toBeVisible();

	// Añadir un elemento desde el propio trabajo.
	await page.getByRole('button', { name: 'Añadir elementos' }).click();
	const elementDialog = page.getByRole('dialog');
	await elementDialog.locator('#element-name-draft').fill('UMA 3');
	await elementDialog
		.locator('#element-name-draft')
		.locator('xpath=../..')
		.getByRole('button', { name: 'Agregar', exact: true })
		.click();
	await elementDialog.getByRole('button', { name: 'Añadir elementos' }).click();

	await expect(page.getByText('Elementos añadidos.')).toBeVisible();
	await expect(page.getByText('UMA 3').filter({ visible: true }).first()).toBeVisible();
});
