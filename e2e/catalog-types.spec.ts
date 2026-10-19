import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('tipos de catálogo: crear, renombrar y eliminar @mobile', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const unique = `Sistemas ${testInfo.project.name} ${Date.now()}`;
	const renamed = `${unique} editado`;

	await ensureAdmin(page);
	await page.goto('/admin/catalogs');

	await page.getByRole('button', { name: 'Tipos de catálogo' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'Tipos de catálogo' })).toBeVisible();
	await expect(dialog.getByText('Sistema', { exact: true }).first()).toBeVisible();

	await dialog.getByRole('button', { name: 'Nuevo tipo' }).click();
	await dialog.locator('#new-type-name').fill(unique);
	await dialog.getByRole('button', { name: 'Añadir' }).click();
	await expect(page.getByText('Tipo de catálogo creado.')).toBeVisible();
	await expect(dialog.getByText(unique)).toBeVisible();

	const created = dialog.locator('li').filter({ hasText: unique }).first();
	await created.getByRole('button', { name: 'Editar' }).click();
	await created.locator('input[name="name"]').fill(renamed);
	await created.getByRole('button', { name: 'Guardar' }).click();
	await expect(page.getByText('Tipo de catálogo actualizado.')).toBeVisible();
	await expect(dialog.getByText(renamed)).toBeVisible();

	const updated = dialog.locator('li').filter({ hasText: renamed }).first();
	await updated.getByRole('button', { name: 'Eliminar' }).click();
	await page.getByRole('button', { name: 'Eliminar tipo' }).click();
	await expect(page.getByText('Tipo de catálogo eliminado.')).toBeVisible();

	await page.getByRole('button', { name: 'Tipos de catálogo' }).click();
	await expect(page.getByRole('dialog').getByText(renamed)).toHaveCount(0);
});
