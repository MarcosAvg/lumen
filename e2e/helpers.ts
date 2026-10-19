import { expect, type Locator, type Page } from '@playwright/test';

// Helpers compartidos por las pruebas E2E.

export const ADMIN = { username: 'admin', password: 'contrasena-segura', displayName: 'Admin E2E' };
const ADMIN_STORAGE_STATE = '.e2e/admin-storage.json';

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

/** Elige un catálogo en el selector inline del modal indicado. */
export async function chooseCatalog(dialog: Locator, name: string, index = 0): Promise<void> {
	await dialog
		.locator('[data-slot="catalog-picker"]')
		.nth(index)
		.locator('[data-slot="catalog-select"]')
		.selectOption({ label: name });
}

export async function ensureAdmin(page: Page) {
	await page.goto('/');

	if (page.url().includes('/setup')) {
		await page.getByLabel('Nombre visible').fill(ADMIN.displayName);
		await page.getByLabel('Usuario').fill(ADMIN.username);
		await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password);
		await page.getByLabel('Repetir contraseña').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Crear administrador' }).click();
	} else if (page.url().includes('/login')) {
		await page.getByLabel('Usuario').fill(ADMIN.username);
		await page.getByLabel('Contraseña').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Entrar' }).click();
	}

	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
	// Si otro test cerró la sesión, deja una cookie válida para los siguientes.
	await page.context().storageState({ path: ADMIN_STORAGE_STATE });
}
