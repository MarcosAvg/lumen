import { expect, test } from '@playwright/test';
import { ensureAdmin, photoFile } from './helpers';

test('el checklist de envío avisa antes de enviar evidencia obligatoria', async ({
	page
}, testInfo) => {
	test.setTimeout(90_000);
	const unique = `${testInfo.project.name}-checklist-${Date.now()}`;
	const serviceName = `Servicio ${unique}`;
	const workName = `Trabajo ${unique}`;

	await ensureAdmin(page);

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
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	await page.getByRole('tab', { name: 'Nombre propio' }).click();
	await page.getByRole('dialog').getByText('Directo', { exact: true }).click();
	await page.locator('#work-name').fill(workName);
	await page.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	const workLink = page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: workName })
		.getByRole('link', { name: workName });
	await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');
	await expect(page.getByRole('heading', { name: workName }).first()).toBeVisible();

	// Requisito obligatorio sin ninguna foto.
	await page.getByRole('button', { name: 'Nuevo requisito' }).click();
	await page.locator('#new-requirement').fill('Antes');
	await page.getByRole('button', { name: 'Añadir requisito' }).click();
	await expect(page.getByText(/Falta evidencia obligatoria en: Antes/)).toBeVisible();

	// El diálogo explica el motivo y bloquea la confirmación.
	await page.getByRole('button', { name: 'Enviar evidencia' }).click();
	await expect(page.getByRole('button', { name: 'Confirmar envío' })).toBeDisabled();
	await page.getByRole('button', { name: 'Cancelar' }).click();

	// Con la foto, el aviso desaparece y se puede enviar.
	await page.locator('input[type="file"]').first().setInputFiles(photoFile());
	await expect(page.getByText(/Falta evidencia obligatoria/)).toHaveCount(0);
	await page.getByRole('button', { name: 'Enviar evidencia' }).click();
	await page.getByRole('button', { name: 'Confirmar envío' }).click();
	await expect(page.getByText('En revisión').first()).toBeVisible();
});
