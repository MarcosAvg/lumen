import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('modales de escritorio, menú de cuenta y panel Más móvil', async ({ page }) => {
	await ensureAdmin(page);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/admin/users');

	// Modal de formulario: ancho cómodo y cuerpo con scroll propio.
	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	const dialogBox = await dialog.boundingBox();
	expect(dialogBox?.width ?? 0).toBeGreaterThanOrEqual(540);
	await expect(dialog.locator('[data-slot="dialog-body"]')).toBeVisible();
	await expect(dialog.locator('[data-slot="dialog-footer"]')).toBeVisible();
	await expect(dialog.locator('#new-role')).toHaveValue('');
	await expect(dialog.getByRole('button', { name: 'Crear usuario' })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();

	// Nuevo servicio: el contrato no viene preseleccionado.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	const serviceDialog = page.getByRole('dialog');
	await expect(serviceDialog.locator('#contractId')).toHaveValue('');
	await expect(serviceDialog.getByRole('button', { name: 'Crear servicio' })).toBeDisabled();
	await page.keyboard.press('Escape');

	// Asignaciones: sin persona por defecto y listas por rol.
	await page.goto('/contracts');
	await page.getByRole('link', { name: 'General' }).first().click();
	await page.getByRole('button', { name: 'Gestionar participantes' }).click();
	const participants = page.getByRole('dialog');
	await expect(participants.locator('#participant-user')).toBeDisabled();
	await expect(participants.getByRole('button', { name: 'Añadir' })).toBeDisabled();
	await participants.getByRole('button', { name: 'Técnico', exact: true }).click();
	await expect(participants.getByText(/^Técnicos \(\d+\)$/)).toBeVisible();
	await expect(participants.getByText(/^Supervisores \(\d+\)$/)).toBeVisible();
	await page.keyboard.press('Escape');

	// Menú de cuenta: más ancho y con cabecera de usuario.
	await page.getByRole('button', { name: /Admin E2E/ }).click();
	const menu = page.locator('[data-slot="dropdown-menu-content"]').first();
	await expect(menu).toBeVisible();
	await page.waitForTimeout(200);
	const menuBox = await menu.boundingBox();
	expect(menuBox?.width ?? 0).toBeGreaterThanOrEqual(270);
	await expect(menu.getByText('Perfil y apariencia')).toBeVisible();
	await expect(menu.getByText('Cerrar sesión')).toBeVisible();
	await page.keyboard.press('Escape');

	// En móvil: panel Más como bottom sheet con cuadrícula.
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/dashboard');
	await page.getByRole('button', { name: 'Más' }).click();
	const sheet = page.locator('[data-slot="sheet-content"]');
	await expect(sheet).toBeVisible();
	const sheetBox = await sheet.boundingBox();
	expect(sheetBox?.width ?? 0).toBeGreaterThanOrEqual(388);
	expect((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0)).toBeGreaterThanOrEqual(840);
	await expect(sheet.getByText('Contratos', { exact: true })).toBeVisible();
	await expect(sheet.getByText('Usuarios', { exact: true })).toBeVisible();
	await expect(sheet.getByText('Catálogos', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(sheet).not.toBeVisible();

	// Modal móvil: ocupa el ancho y se apoya en el borde inferior.
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const mobileDialog = page.getByRole('dialog');
	await expect(mobileDialog).toBeVisible();
	const mobileBox = await mobileDialog.boundingBox();
	expect(mobileBox?.width ?? 0).toBeGreaterThanOrEqual(388);
	expect((mobileBox?.y ?? 0) + (mobileBox?.height ?? 0)).toBeGreaterThanOrEqual(840);
});
