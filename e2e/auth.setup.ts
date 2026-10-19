import { expect, test as setup } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ADMIN } from './helpers';

const storageState = '.e2e/admin-storage.json';

setup('preparar sesión de administrador', async ({ page }) => {
	mkdirSync('.e2e', { recursive: true });
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
	await page.context().storageState({ path: storageState });
});
