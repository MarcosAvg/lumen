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
	await expect(page.locator('#page-title')).toContainText('Hola,');
}

const ROUTES = [
	'/dashboard',
	'/services',
	'/admin/services',
	'/admin/catalogs',
	'/admin/users',
	'/reviews',
	'/notifications',
	'/settings',
	'/search'
];

test('ninguna página de admin desborda horizontalmente', async ({ page }) => {
	test.setTimeout(90_000);
	await ensureAdmin(page);

	for (const width of [360, 390, 768, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const route of ROUTES) {
			await page.goto(route);
			await page.waitForTimeout(100);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow, `${route} desborda a ${width}px (+${overflow})`).toBeLessThanOrEqual(2);
		}
	}
});

test('las acciones del catálogo son alcanzables en móvil', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const catalogName = `Sin desborde ${testInfo.project.name}-${Date.now()}`;

	await ensureAdmin(page);
	await page.setViewportSize({ width: 390, height: 844 });

	await page.goto('/admin/catalogs');
	await page.getByRole('button', { name: 'Nuevo catálogo' }).click();
	await page.getByLabel('Nombre', { exact: true }).fill(catalogName);
	await page.getByRole('button', { name: 'Crear catálogo' }).click();
	await expect(page.getByText('Catálogo creado.')).toBeVisible();

	const catalogHref = await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: catalogName })
		.getByRole('link', { name: catalogName })
		.getAttribute('href');
	await page.goto(catalogHref ?? '/admin/catalogs');

	await page.getByRole('button', { name: 'Nuevo ítem' }).click();
	await page.locator('#item-name').fill('Ítem móvil');
	await page.getByRole('button', { name: 'Añadir' }).click();

	const item = page.locator('li').filter({ visible: true }).filter({ hasText: 'Ítem móvil' });
	await expect(item.getByRole('button', { name: /Relaciones/ })).toBeVisible();
	await expect(item.getByRole('button', { name: 'Renombrar' })).toBeVisible();
	await expect(item.getByRole('button', { name: 'Eliminar' })).toBeVisible();
});
