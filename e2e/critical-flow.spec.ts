import { expect, test, type Page } from '@playwright/test';

/**
 * Flujo crítico de la aplicación, en escritorio y móvil: primer arranque o
 * acceso, creación de servicio/trabajo, captura, envío, revisión y búsqueda.
 */
const ADMIN = { username: 'admin', password: 'contrasena-segura', displayName: 'Admin E2E' };

const JPEG_BASE64 =
	'/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

function photoFile() {
	return {
		name: 'foto.jpg',
		mimeType: 'image/jpeg',
		buffer: Buffer.from(JPEG_BASE64, 'base64')
	};
}

async function ensureAdmin(page: Page) {
	await page.goto('/');
	if (page.url().includes('/setup')) {
		await page.getByLabel('Nombre visible').fill(ADMIN.displayName);
		await page.getByLabel('Usuario').fill(ADMIN.username);
		await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password);
		await page.getByLabel('Repetir contraseña').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Crear administrador' }).click();
	} else {
		await page.getByLabel('Usuario').fill(ADMIN.username);
		await page.getByLabel('Contraseña').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Entrar' }).click();
	}
	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
}

test('flujo crítico: captura, envío, revisión y búsqueda', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-${Date.now()}`;
	const serviceName = `Servicio ${unique}`;
	const workName = `Trabajo ${unique}`;

	await test.step('acceso', async () => {
		await ensureAdmin(page);
	});

	await test.step('crear servicio', async () => {
		await page.goto('/admin/services');
		await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
		await page.getByRole('button', { name: 'Crear servicio' }).click();
		await expect(page.getByText('Servicio creado.')).toBeVisible();
	});

	await test.step('abrir servicio y crear trabajo', async () => {
		const serviceLink = page
			.getByRole('listitem')
			.filter({ hasText: serviceName })
			.getByRole('link', { name: 'Ver servicio' });
		await page.goto((await serviceLink.getAttribute('href')) ?? '/admin/services');
		await expect(page.getByRole('heading', { name: serviceName }).first()).toBeVisible();
		await page.locator('#work-mode').selectOption('direct');
		await page.locator('#work-name').fill(workName);
		await page.getByRole('button', { name: 'Crear trabajo' }).click();
		await expect(page.getByText('Trabajo creado.')).toBeVisible();
	});

	await test.step('capturar y enviar evidencia', async () => {
		const workLink = page
			.getByRole('listitem')
			.filter({ hasText: workName })
			.getByRole('link', { name: 'Abrir' });
		await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');
		await expect(page.getByRole('heading', { name: workName }).first()).toBeVisible();
		await page.locator('input[type="file"]').last().setInputFiles(photoFile());
		await expect(page.locator('img[alt^="Foto 1 de"]').first()).toBeVisible();
		await page.getByRole('button', { name: 'Enviar evidencia' }).click();
		await page.getByRole('button', { name: 'Confirmar envío' }).click();
		await expect(page.getByText('En revisión').first()).toBeVisible();
	});

	await test.step('revisar y aprobar', async () => {
		await page.goto('/reviews');
		const reviewLink = page
			.getByRole('listitem')
			.filter({ hasText: workName })
			.getByRole('link', { name: 'Revisar' });
		await page.goto((await reviewLink.getAttribute('href')) ?? '/reviews');
		await expect(page.getByRole('heading', { name: /Entrega #/ })).toBeVisible();
		await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
		await expect(page.getByText('Aprobada').first()).toBeVisible();
	});

	await test.step('buscar el trabajo', async () => {
		const search = page.getByLabel('Buscar servicios, trabajos y elementos');
		await search.fill(workName);
		await search.press('Enter');
		await expect(page.getByRole('heading', { name: 'Buscar' })).toBeVisible();
		await expect(page.getByText(workName, { exact: false }).first()).toBeVisible();
	});
});
