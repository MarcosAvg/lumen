import { expect, test, type Page } from '@playwright/test';
import { ensureAdmin, photoFile } from './helpers';

/** Comprueba que la ruta no desborda horizontalmente en el ancho indicado. */
async function expectNoOverflow(page: Page, route: string, width: number) {
	await page.setViewportSize({ width, height: 900 });
	await page.goto(route);
	await page.waitForTimeout(120);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow, `${route} desborda a ${width}px (+${overflow})`).toBeLessThanOrEqual(2);
}

const LIST_ROUTES = [
	'/dashboard',
	'/services',
	'/contracts',
	'/admin/services',
	'/admin/catalogs',
	'/admin/users',
	'/reviews',
	'/notifications',
	'/settings',
	'/search'
];

test('ninguna página de listado desborda horizontalmente', async ({ page }) => {
	test.setTimeout(90_000);
	await ensureAdmin(page);

	for (const width of [320, 360, 390, 768, 1280]) {
		for (const route of LIST_ROUTES) {
			await expectNoOverflow(page, route, width);
		}
	}
});

test('las fichas (servicio, trabajo, elemento y entrega) no desbordan', async ({
	page
}, testInfo) => {
	test.setTimeout(150_000);
	const stamp = Date.now();
	const serviceName = `Mantenimiento Preventivo Edificio Central ${testInfo.project.name} ${stamp}`;
	const workName = `Trabajo UMA de climatización ${stamp}`;

	await ensureAdmin(page);

	// Servicio con descripción larga (estresa la cabecera con acciones).
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	const serviceDialog = page.getByRole('dialog');
	await serviceDialog.locator('#name').fill(serviceName);
	await serviceDialog
		.locator('#description')
		.fill(
			'Descripción larga de servicio para comprobar que las acciones de la cabecera no desbordan.'
		);
	await serviceDialog.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	const serviceHref = await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: serviceName })
		.getByRole('link', { name: serviceName })
		.getAttribute('href');
	const servicePath = new URL(serviceHref ?? '/admin/services', 'http://x/').pathname;
	await page.goto(servicePath);

	// Trabajo dividido con un elemento (para tener también la ficha de elemento).
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const workDialog = page.getByRole('dialog');
	await workDialog.locator('#work-mode').selectOption('divided');
	await workDialog.getByRole('tab', { name: 'Nombre propio' }).click();
	await workDialog.locator('#work-name').fill(workName);
	await workDialog.locator('#element-name-draft').fill('UMA 1');
	await workDialog
		.locator('#element-name-draft')
		.locator('xpath=../..')
		.getByRole('button', { name: 'Agregar', exact: true })
		.click();
	await workDialog.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	const workPath = new URL(
		(await page
			.locator('tr, li')
			.filter({ visible: true })
			.filter({ hasText: workName })
			.getByRole('link', { name: workName })
			.getAttribute('href')) ?? '/dashboard',
		'http://x/'
	).pathname;
	await page.goto(workPath);
	const elementPath = new URL(
		(await page.getByRole('link', { name: 'UMA 1' }).getAttribute('href')) ?? '/dashboard',
		'http://x/'
	).pathname;

	// Entrega: crear un trabajo directo, subir foto y enviar.
	await page.goto(servicePath);
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const directDialog = page.getByRole('dialog');
	await directDialog.getByRole('tab', { name: 'Nombre propio' }).click();
	await directDialog.locator('#work-mode').selectOption('direct');
	await directDialog.locator('#work-name').fill(`${workName} directo`);
	await directDialog.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();
	const directPath = new URL(
		(await page
			.locator('tr, li')
			.filter({ visible: true })
			.filter({ hasText: `${workName} directo` })
			.getByRole('link', { name: `${workName} directo` })
			.getAttribute('href')) ?? '/dashboard',
		'http://x/'
	).pathname;
	await page.goto(directPath);
	await page.locator('input[type="file"]').first().setInputFiles(photoFile());
	await page.getByRole('button', { name: 'Enviar evidencia' }).click();
	await page.getByRole('button', { name: 'Confirmar envío' }).click();
	await expect(page.getByText('En revisión').first()).toBeVisible();

	await page.goto('/reviews');
	const submissionHref = await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: `${workName} directo` })
		.getByRole('link')
		.first()
		.getAttribute('href');
	const submissionPath = new URL(submissionHref ?? '/reviews', 'http://x/').pathname;

	for (const width of [320, 360, 390, 768]) {
		for (const route of [servicePath, workPath, elementPath, submissionPath]) {
			await expectNoOverflow(page, route, width);
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
