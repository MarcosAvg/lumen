import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('los servicios en espera se activan y pausan desde su ficha', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const serviceName = `Servicio espera ${testInfo.project.name}-${Date.now()}`;

	await ensureAdmin(page);
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.locator('#contractId').selectOption({ label: 'General' });
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByLabel('Crear en espera, sin capturar evidencia todavía', { exact: true }).check();
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	// El filtro inicial es Activos: el servicio en espera no aparece hasta cambiar.
	await expect(page.getByText(serviceName).filter({ visible: true })).toHaveCount(0);
	await page.getByRole('button', { name: /^En espera/ }).click();
	await page.getByRole('link', { name: serviceName }).click();
	await expect(page.getByRole('heading', { name: serviceName })).toBeVisible();
	await expect(page.getByText('En espera', { exact: true }).first()).toBeVisible();

	await page.getByRole('button', { name: 'Activar servicio' }).click();
	await expect(page.getByText('Estado del servicio actualizado.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Pausar servicio' })).toBeVisible();

	await page.getByRole('button', { name: 'Pausar servicio' }).click();
	await expect(page.getByText('Estado del servicio actualizado.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reactivar servicio' })).toBeVisible();
});
