import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('trabajo dividido: crear con elementos y añadir desde el trabajo', async ({
	page
}, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-div-${Date.now()}`;
	const serviceName = `Servicio ${unique}`;
	const workName = `Piso ${unique}`;

	await ensureAdmin(page);

	// Crear servicio.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.locator('#contractId').selectOption({ label: 'General' });
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	const serviceLink = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: serviceName })
		.getByRole('link', { name: serviceName })
		.first();
	await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');

	// Crear trabajo dividido con dos elementos (por nombre propio).
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByText('Dividido', { exact: true }).click();
	const sourceTab = dialog.getByRole('tab', { name: 'Nombre propio' });
	if ((await sourceTab.count()) > 0) await sourceTab.first().click();
	await dialog.locator('#work-name').fill(workName);

	const elementsComposer = dialog.locator('[data-slot="draft-composer"][data-kind="elementos"]');
	const elementsTab = elementsComposer.getByRole('tab', { name: 'Nombre propio' });
	if ((await elementsTab.count()) > 0) await elementsTab.click();
	await elementsComposer.getByLabel('Nombre del elemento').fill('UMA 1');
	await elementsComposer.getByRole('button', { name: 'Añadir', exact: true }).click();
	await elementsComposer.getByLabel('Nombre del elemento').fill('UMA 2');
	await elementsComposer.getByRole('button', { name: 'Añadir', exact: true }).click();
	await dialog.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	// Abrir el trabajo y comprobar los dos elementos.
	const workLink = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: workName })
		.getByRole('link', { name: workName })
		.first();
	await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');
	await expect(page.getByText('UMA 1').filter({ visible: true }).first()).toBeVisible();
	await expect(page.getByText('UMA 2').filter({ visible: true }).first()).toBeVisible();

	// Añadir un elemento desde el propio trabajo.
	await page.getByRole('button', { name: 'Añadir elementos' }).click();
	const elementDialog = page.getByRole('dialog');
	const addElementsComposer = elementDialog.locator(
		'[data-slot="draft-composer"][data-kind="elementos"]'
	);
	const addElementsTab = addElementsComposer.getByRole('tab', { name: 'Nombre propio' });
	if ((await addElementsTab.count()) > 0) await addElementsTab.click();
	await addElementsComposer.getByLabel('Nombre del elemento').fill('UMA 3');
	await addElementsComposer.getByRole('button', { name: 'Añadir', exact: true }).click();
	await elementDialog.getByRole('button', { name: 'Añadir elementos' }).click();

	await expect(page.getByText('Elementos añadidos.')).toBeVisible();
	await expect(page.getByText('UMA 3').filter({ visible: true }).first()).toBeVisible();
});
