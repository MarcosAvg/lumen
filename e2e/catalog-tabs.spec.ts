import { expect, test } from '@playwright/test';
import { ensureAdmin } from './helpers';

test('las pestañas de catálogos son alcanzables en móvil', async ({ page }) => {
	await ensureAdmin(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/admin/catalogs');

	const lista = page.locator('[data-slot="tabs-list"]');
	const todos = lista.getByRole('tab', { name: /Todos/ });
	const requisitos = lista.getByRole('tab', { name: /Requisitos/ });

	const listaBox = await lista.boundingBox();
	const todosBox = await todos.boundingBox();
	expect(listaBox).not.toBeNull();
	expect(todosBox).not.toBeNull();
	// La primera pestaña no puede quedar recortada por el centrado del contenedor.
	expect(todosBox!.x).toBeGreaterThanOrEqual(listaBox!.x - 1);

	await requisitos.scrollIntoViewIfNeeded();
	const requisitosBox = await requisitos.boundingBox();
	expect(requisitosBox).not.toBeNull();
	expect(requisitosBox!.x + requisitosBox!.width).toBeLessThanOrEqual(
		listaBox!.x + listaBox!.width + 1
	);
	await requisitos.click();
	await expect(requisitos).toHaveAttribute('aria-selected', 'true');
});
