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

test('ninguna página de listado desborda horizontalmente @mobile', async ({ page }) => {
	test.setTimeout(90_000);
	await ensureAdmin(page);

	for (const width of [320, 360, 390, 768, 1280]) {
		for (const route of LIST_ROUTES) {
			await expectNoOverflow(page, route, width);
		}
	}
});

test('las fichas (servicio, trabajo, elemento y entrega) no desbordan @mobile', async ({
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
	await page.locator('#contractId').selectOption({ label: 'General' });
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
		.first()
		.getAttribute('href');
	const servicePath = new URL(serviceHref ?? '/admin/services', 'http://x/').pathname;
	await page.goto(servicePath);

	// Trabajo dividido con un elemento (para tener también la ficha de elemento).
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const workDialog = page.getByRole('dialog');
	await workDialog.getByText('Dividido', { exact: true }).click();
	const dividedSourceTab = workDialog.getByRole('tab', { name: 'Nombre propio' });
	if ((await dividedSourceTab.count()) > 0) await dividedSourceTab.first().click();
	await workDialog.locator('#work-name').fill(workName);
	const elementsComposer = workDialog.locator(
		'[data-slot="draft-composer"][data-kind="elementos"]'
	);
	const elementsTab = elementsComposer.getByRole('tab', { name: 'Nombre propio' });
	if ((await elementsTab.count()) > 0) await elementsTab.click();
	await elementsComposer.getByLabel('Nombre del elemento').fill('UMA 1');
	await elementsComposer.getByRole('button', { name: 'Añadir', exact: true }).click();
	await workDialog.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	const workPath = new URL(
		(await page
			.locator('tr, li')
			.filter({ visible: true })
			.filter({ hasText: workName })
			.getByRole('link', { name: workName })
			.first()
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
	const directSourceTab = directDialog.getByRole('tab', { name: 'Nombre propio' });
	if ((await directSourceTab.count()) > 0) await directSourceTab.first().click();
	await directDialog.getByText('Directo', { exact: true }).click();
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
