import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('el tema claro/oscuro/sistema persiste y actualiza la interfaz', async ({ page }) => {
	await ensureAdmin(page);
	const manifest = await (await page.request.get('/manifest.webmanifest')).json();
	expect(manifest.theme_color).toBe('#edf2f6');
	expect(manifest.background_color).toBe('#edf2f6');
	await page.goto('/settings');

	const oscuro = page.getByRole('button', { name: 'Oscuro' });
	await oscuro.click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.locator('html')).toHaveCSS('background-color', 'oklch(0.145 0.014 258)');
	await expect(oscuro).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#070a10');

	await page.reload();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.getByRole('button', { name: 'Oscuro' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	await page.getByRole('button', { name: 'Sistema' }).click();
	await expect(page.getByRole('button', { name: 'Sistema' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	expect(await page.evaluate(() => localStorage.getItem('mode-watcher-mode'))).toBe('system');

	await page.getByRole('button', { name: 'Claro' }).click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await expect(page.locator('html')).toHaveCSS('background-color', 'oklch(0.958 0.008 250)');
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#edf2f6');
});
