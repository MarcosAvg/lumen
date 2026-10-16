import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('el tablero se adapta al rol del usuario', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const username = `dash${testInfo.project.name}${Date.now()}`.replace(/[^a-z0-9]/gi, '');
	const displayName = `Dashboard ${testInfo.project.name}`;
	const password = 'contrasena-segura';

	await ensureAdmin(page);

	// Administrador: resumen global y cola de revisión.
	await page.goto('/dashboard');
	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
	await expect(page.getByText('Objetivos aprobados')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Entregas por revisar' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Revisiones' })).toBeVisible();

	// Técnico: sin cola de revisión y con su propio mensaje.
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('#new-displayName').fill(displayName);
	await dialog.locator('#new-username').fill(username);
	await dialog.locator('#new-password').fill(password);
	await dialog.locator('#new-role').selectOption('technician');
	await dialog.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(page.getByText('Usuario creado.')).toBeVisible();

	await page.context().clearCookies();
	await page.goto('/');
	await page.getByLabel('Usuario').fill(username);
	await page.getByLabel('Contraseña').fill(password);
	await page.getByRole('button', { name: 'Entrar' }).click();
	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
	await expect(page.getByText('No tienes evidencia pendiente. Buen trabajo.')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Entregas por revisar' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Revisiones' })).toHaveCount(0);
});
