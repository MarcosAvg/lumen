import { expect, test } from '@playwright/test';
import { ADMIN, ensureAdmin } from './helpers';

test('el perfil muestra la cuenta y permite cerrar sesión', async ({ page }) => {
	await ensureAdmin(page);

	await page.goto('/settings');
	await expect(page.locator('#page-title')).toHaveText('Perfil');
	await expect(page.getByText('Cuenta', { exact: true })).toBeVisible();
	await expect(page.locator('#contenido').getByText(ADMIN.username, { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Cerrar sesión' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
