import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('el tema claro/oscuro/sistema persiste y actualiza la interfaz', async ({ page }) => {
	await ensureAdmin(page);
	const manifest = await (await page.request.get('/manifest.webmanifest')).json();
	expect(manifest.theme_color).toBe('#1e4b8d');
	await page.goto('/settings');

	const oscuro = page.getByRole('button', { name: 'Oscuro' });
	await oscuro.click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(oscuro).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a');

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
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e4b8d');
});
