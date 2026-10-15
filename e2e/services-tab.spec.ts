import { expect, test, type Page } from '@playwright/test';

const ADMIN = { username: 'admin', password: 'contrasena-segura', displayName: 'Admin E2E' };
const TECH_PASSWORD = 'contrasena-segura';

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

async function createService(page: Page, name: string): Promise<string> {
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();
	const href = await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: name })
		.getByRole('link', { name })
		.getAttribute('href');
	return (href ?? '').split('/').pop() ?? '';
}

test('el técnico ve solo sus servicios asignados y puede seleccionarlos', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	const stamp = Date.now();
	const assigned = `Asignado ${testInfo.project.name}-${stamp}`;
	const other = `Ajeno ${testInfo.project.name}-${stamp}`;
	const techName = `Técnico ${testInfo.project.name}-${stamp}`;
	const techUsername = `svc${testInfo.project.name}${stamp}`.replace(/[^a-z0-9]/gi, '');

	await ensureAdmin(page);
	const assignedId = await createService(page, assigned);
	await createService(page, other);

	// Crear técnico y asignarlo solo al primer servicio.
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('#new-displayName').fill(techName);
	await dialog.locator('#new-username').fill(techUsername);
	await dialog.locator('#new-password').fill(TECH_PASSWORD);
	await dialog.locator('#new-role').selectOption('technician');
	await dialog.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(page.getByText('Usuario creado.')).toBeVisible();

	await page.goto(`/services/${assignedId}`);
	await page.getByRole('button', { name: 'Gestionar asignaciones' }).click();
	const assignDialog = page.getByRole('dialog');
	await assignDialog.locator('#technician').selectOption({ label: techName });
	await assignDialog.getByRole('button', { name: 'Asignar' }).first().click();
	await expect(page.getByText('Asignación guardada.')).toBeVisible();

	// Entrar como técnico.
	await page.context().clearCookies();
	await page.goto('/');
	await page.getByLabel('Usuario').fill(techUsername);
	await page.getByLabel('Contraseña').fill(TECH_PASSWORD);
	await page.getByRole('button', { name: 'Entrar' }).click();
	await expect(page.locator('#page-title')).toContainText('Hola,');

	// Servicios: solo el asignado.
	await page.goto('/services');
	await expect(page.locator('#page-title')).toHaveText('Servicios');
	await expect(page.getByText(assigned).filter({ visible: true }).first()).toBeVisible();
	await expect(page.getByText(other)).toHaveCount(0);

	// Seleccionar el servicio navega a su ficha.
	await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: assigned })
		.getByRole('link', { name: assigned })
		.click();
	await expect(page.locator('#page-title')).toHaveText(assigned);
});
