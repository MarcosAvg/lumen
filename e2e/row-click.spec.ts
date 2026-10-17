import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('la fila/tarjeta completa navega, no solo el nombre', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-row-${Date.now()}`;
	const serviceName = `Servicio ${unique}`;
	const description = `Descripción ${unique}`;

	await ensureAdmin(page);

	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.locator('#contractId').selectOption({ label: 'General' });
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByLabel('Descripción (opcional)').fill(description);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	// Pulso con coordenadas sobre la descripción (que no es el enlace): el
	// enlace estirado cubre toda la fila/tarjeta, así que el navegador enruta el
	// clic al overlay y navega. Uso `mouse.click` para no frenar por intercepción.
	const target = page.getByText(description).filter({ visible: true }).first();
	await target.scrollIntoViewIfNeeded();
	const box = await target.boundingBox();
	if (!box) throw new Error('No se pudo localizar la descripción.');
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page.getByRole('heading', { name: serviceName })).toBeVisible();
});
