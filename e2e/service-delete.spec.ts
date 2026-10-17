import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('el administrador elimina un servicio desde su página', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const serviceName = `Servicio borrar ${testInfo.project.name}-${Date.now()}`;

	await ensureAdmin(page);

	// Crear servicio y abrirlo.
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
		.getByRole('link', { name: serviceName });
	await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');
	await expect(page.getByRole('heading', { name: serviceName })).toBeVisible();

	// Eliminar con confirmación.
	await page.getByRole('button', { name: 'Eliminar servicio' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog.getByText(`¿Eliminar «${serviceName}»?`)).toBeVisible();
	await dialog.getByRole('button', { name: 'Confirmar eliminación' }).click();

	// Redirige a Inicio y el servicio ya no existe.
	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
	await page.goto('/admin/services');
	await expect(page.getByText(serviceName)).toHaveCount(0);
});
