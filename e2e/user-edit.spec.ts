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

test('el administrador edita datos, rol y contraseña en el modal', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const stamp = Date.now();
	const username = `edit${testInfo.project.name}${stamp}`.replace(/[^a-z0-9]/gi, '');
	const displayName = `Editar ${testInfo.project.name}-${stamp}`;
	const newName = `${displayName} renombrado`;

	await ensureAdmin(page);
	await page.goto('/admin/users');

	// Crear usuario.
	await page.locator('#new-displayName').fill(displayName);
	await page.locator('#new-username').fill(username);
	await page.locator('#new-password').fill('contrasena-segura');
	await page.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(page.getByText('Usuario creado.')).toBeVisible();

	// Editar datos (nombre y usuario).
	let row = page.getByRole('listitem').filter({ hasText: displayName });
	await row.getByRole('button', { name: 'Editar' }).click();
	let dialog = page.getByRole('dialog');
	await dialog.locator('#edit-displayName').fill(newName);
	await dialog.locator('#edit-username').fill(`${username}x`);
	await dialog.getByRole('button', { name: 'Guardar datos' }).click();
	await expect(page.getByText('Usuario actualizado.')).toBeVisible();
	await expect(page.getByText(newName)).toBeVisible();

	// Cambiar rol.
	row = page.getByRole('listitem').filter({ hasText: newName });
	await row.getByRole('button', { name: 'Editar' }).click();
	dialog = page.getByRole('dialog');
	await dialog.locator('#edit-role').selectOption('supervisor');
	await dialog.getByRole('button', { name: 'Cambiar rol' }).click();
	await expect(page.getByText('Rol actualizado.')).toBeVisible();
	await expect(row.getByText('Supervisor')).toBeVisible();

	// Restablecer contraseña.
	await row.getByRole('button', { name: 'Editar' }).click();
	dialog = page.getByRole('dialog');
	await dialog.locator('#edit-password').fill('otra-contrasena-segura');
	await dialog.getByRole('button', { name: 'Restablecer contraseña' }).click();
	await expect(page.getByText(/Contraseña restablecida/)).toBeVisible();
});
