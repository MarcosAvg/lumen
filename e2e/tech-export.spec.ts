import { expect, test, type Page } from '@playwright/test';

const ADMIN = { username: 'admin', password: 'contrasena-segura', displayName: 'Admin E2E' };
const DUMMY_UUID = '00000000-0000-4000-8000-000000000000';
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
	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
}

test('los técnicos no pueden exportar el ZIP', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const unique = `${testInfo.project.name}-exp-${Date.now()}`;
	const serviceName = `Servicio ${unique}`;
	const techName = `Técnico ${unique}`;
	const techUsername = `tech${unique}`.replace(/[^a-z0-9]/gi, '');

	await ensureAdmin(page);

	// Crear servicio y obtener su id.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	const serviceHref = await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: serviceName })
		.getByRole('link', { name: serviceName })
		.getAttribute('href');
	const serviceId = (serviceHref ?? '').split('/').pop() ?? '';

	// Admin: ve el botón, el acceso a asignaciones y el endpoint no responde 403.
	await page.goto(serviceHref ?? '/admin/services');
	await expect(page.getByRole('link', { name: 'Exportar ZIP' })).toBeVisible();
	expect((await page.request.get(`/api/services/${serviceId}/export.zip`)).status()).not.toBe(403);

	// Desde la ficha se accede a la pantalla de asignaciones.
	await page.getByRole('link', { name: 'Gestionar asignaciones' }).click();
	await expect(page).toHaveURL(new RegExp(`/admin/services/${serviceId}$`));

	// Crear un técnico y asignarlo al servicio.
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const createDialog = page.getByRole('dialog');
	await createDialog.locator('#new-displayName').fill(techName);
	await createDialog.locator('#new-username').fill(techUsername);
	await createDialog.locator('#new-password').fill(TECH_PASSWORD);
	await createDialog.locator('#new-role').selectOption('technician');
	await createDialog.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(page.getByText('Usuario creado.')).toBeVisible();

	await page.goto(`/admin/services/${serviceId}`);
	await page.locator('#technician').selectOption({ label: techName });
	await page.getByRole('button', { name: 'Asignar' }).first().click();
	await expect(page.getByText('Asignación guardada.')).toBeVisible();

	// Revocar pide confirmación en modal (se cancela para conservar la asignación).
	await page.getByRole('button', { name: 'Revocar' }).click();
	const revokeDialog = page.getByRole('alertdialog');
	await expect(revokeDialog).toBeVisible();
	await revokeDialog.getByRole('button', { name: 'Cancelar' }).click();
	await expect(revokeDialog).toBeHidden();

	// Entrar como técnico.
	await page.context().clearCookies();
	await page.goto('/');
	await page.getByLabel('Usuario').fill(techUsername);
	await page.getByLabel('Contraseña').fill(TECH_PASSWORD);
	await page.getByRole('button', { name: 'Entrar' }).click();
	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();

	// El técnico ve el servicio pero no puede exportar ni asignar.
	await page.goto(serviceHref ?? '/dashboard');
	await expect(page.getByRole('heading', { name: serviceName })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Exportar ZIP' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Gestionar asignaciones' })).toHaveCount(0);
	expect((await page.request.get(`/api/services/${serviceId}/export.zip`)).status()).toBe(403);
	expect((await page.request.get(`/api/submissions/${DUMMY_UUID}/export.zip`)).status()).toBe(403);
});
