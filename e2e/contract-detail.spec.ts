import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('la ficha del contrato: cabecera con avance, dos columnas y participantes en modal', async ({
	page
}) => {
	test.setTimeout(90_000);

	await ensureAdmin(page);

	// Se reutiliza el contrato «General» de las pruebas (no se crea uno nuevo
	// para no alterar el contrato por defecto del resto de specs).
	await page.goto('/contracts');
	await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: 'General' })
		.getByRole('link', { name: 'General' })
		.first()
		.click();

	// Cabecera: metadatos, acceso y medidor de avance.
	await expect(page.locator('#page-title')).toHaveText('General');
	const content = page.locator('#contenido');
	await expect(content.getByText('Tu acceso')).toBeVisible();
	await expect(content.getByText('Administrador', { exact: true })).toBeVisible();
	await expect(content.locator('[aria-label*="objetivos aprobados"]').first()).toBeVisible();

	// Dos columnas: servicios en la principal; participantes y peligro en el rail.
	await expect(content.locator('[data-slot="card-title"]', { hasText: 'Servicios' })).toBeVisible();
	await expect(
		content.locator('[data-slot="card-title"]', { hasText: 'Participantes' })
	).toBeVisible();
	await expect(
		content.locator('[data-slot="card-title"]', { hasText: 'Zona de peligro' })
	).toBeVisible();

	// Participantes se gestionan en modal.
	await page.getByRole('button', { name: 'Gestionar participantes' }).click();
	const membersDialog = page.getByRole('dialog');
	await expect(membersDialog.getByText('Añadir técnico')).toBeVisible();
	await membersDialog.getByRole('button', { name: 'Cerrar' }).first().click();

	// El borrado exige confirmación explícita.
	await page.getByRole('button', { name: 'Eliminar contrato' }).click();
	await expect(page.getByRole('alertdialog')).toBeVisible();
	await page.getByRole('button', { name: 'Cancelar' }).click();
	await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
