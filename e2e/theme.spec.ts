import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('el tema claro/oscuro/sistema persiste y actualiza la interfaz', async ({ page }) => {
	await ensureAdmin(page);
	await page.goto('/settings');

	const oscuro = page.getByRole('button', { name: 'Oscuro' });
	await oscuro.click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(oscuro).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#15181d');

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
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f6f7f9');
});
