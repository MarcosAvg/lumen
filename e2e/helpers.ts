import { expect, type Locator, type Page } from '@playwright/test';

// Helpers compartidos por las pruebas E2E.

export const ADMIN = { username: 'admin', password: 'contrasena-segura', displayName: 'Admin E2E' };

// Imagen JPEG 1x1 válida para las subidas de prueba.
const JPEG_BASE64 =
	'/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

export function photoFile() {
	return {
		name: 'foto.jpg',
		mimeType: 'image/jpeg',
		buffer: Buffer.from(JPEG_BASE64, 'base64')
	};
}

/** Elige un catálogo en el selector agrupado del modal indicado. */
export async function chooseCatalog(
	page: Page,
	dialog: Locator,
	name: string,
	index = 0
): Promise<void> {
	await dialog.locator('[data-slot="catalog-picker-trigger"]').nth(index).click();
	await page.locator('[data-slot="command-item"]').filter({ hasText: name }).first().click();
}

/** Elige el tipo de trabajo en sus tarjetas de radio. */
export async function chooseWorkMode(dialog: Locator, mode: 'Directo' | 'Dividido'): Promise<void> {
	await dialog.getByText(mode, { exact: true }).click();
}

export async function ensureAdmin(page: Page) {
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
