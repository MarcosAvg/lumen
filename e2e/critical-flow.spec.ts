import { expect, test, type Page } from '@playwright/test';

/**
 * Flujo crítico de la aplicación, en escritorio y móvil: primer arranque o
 * acceso, creación de servicio/trabajo, captura, envío, revisión (aprobar y
 * rechazar) y búsqueda.
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

/** Crea servicio → trabajo directo → sube una foto → envía. Deja la entrega en revisión. */
async function createPendingSubmission(page: Page, unique: string) {
	const serviceName = `Servicio ${unique}`;
	const workName = `Trabajo ${unique}`;

	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
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
	await page.locator('#work-mode').selectOption('direct');
	await page.locator('#work-name').fill(workName);
	await page.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();

	const workLink = page
		.getByRole('listitem')
		.filter({ hasText: workName })
		.getByRole('link', { name: workName });
	await page.goto((await workLink.getAttribute('href')) ?? '/dashboard');
	await expect(page.getByRole('heading', { name: workName }).first()).toBeVisible();
	await page.locator('input[type="file"]').last().setInputFiles(photoFile());
	await expect(page.locator('img[alt^="Foto 1 de"]').first()).toBeVisible();
	// Sin requisitos, el grupo se muestra como «Fotografías», no «Adicionales».
	await expect(page.getByText('Fotografías').first()).toBeVisible();
	await page.getByRole('button', { name: 'Enviar evidencia' }).click();
	await page.getByRole('button', { name: 'Confirmar envío' }).click();
	await expect(page.getByText('En revisión').first()).toBeVisible();

	return workName;
}

test('flujo crítico: captura, envío, aprobación y búsqueda', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-aprobar-${Date.now()}`;

	await test.step('acceso', async () => {
		await ensureAdmin(page);
	});

	const workName = await test.step('crear entrega pendiente', () =>
		createPendingSubmission(page, unique));

	await test.step('revisar y aprobar', async () => {
		await page.goto('/reviews');
		const reviewLink = page
			.locator('tr, li')
			.filter({ visible: true })
			.filter({ hasText: workName })
			.getByRole('link', { name: workName });
		await page.goto((await reviewLink.getAttribute('href')) ?? '/reviews');
		await expect(page.getByRole('heading', { name: /Entrega #/ })).toBeVisible();
		await page.getByRole('button', { name: 'Aprobar entrega' }).click();
		await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
		await expect(page.getByText('Aprobada').first()).toBeVisible();
	});

	await test.step('buscar el trabajo', async () => {
		await page.goto('/search');
		await page.getByPlaceholder('Nombre de servicio, trabajo o elemento').fill(workName);
		await page.getByRole('button', { name: 'Buscar' }).click();
		await expect(page.getByRole('heading', { name: 'Buscar' })).toBeVisible();
		await expect(
			page.getByText(workName, { exact: false }).filter({ visible: true }).first()
		).toBeVisible();
	});
});

test('flujo crítico: rechazo con motivo y corrección', async ({ page }, testInfo) => {
	test.setTimeout(60_000);
	const unique = `${testInfo.project.name}-rechazar-${Date.now()}`;
	const reason = 'Falta la foto de después';

	await ensureAdmin(page);
	const workName = await createPendingSubmission(page, unique);

	await test.step('rechazar con motivo', async () => {
		await page.goto('/reviews');
		const reviewLink = page
			.locator('tr, li')
			.filter({ visible: true })
			.filter({ hasText: workName })
			.getByRole('link', { name: workName });
		await page.goto((await reviewLink.getAttribute('href')) ?? '/reviews');
		await expect(page.getByRole('heading', { name: /Entrega #/ })).toBeVisible();

		await page.getByRole('button', { name: 'Rechazar entrega' }).click();
		await page.getByLabel('Motivo del rechazo (obligatorio)').fill(reason);
		await page.getByRole('button', { name: 'Confirmar rechazo' }).click();

		await expect(
			page.getByText('Entrega rechazada. Los técnicos pueden corregir y reenviar.')
		).toBeVisible();
		await expect(page.getByText(/Rechazada por/)).toBeVisible();
		await expect(page.getByText(new RegExp(`Motivo: ${reason}`))).toBeVisible();
	});

	await test.step('el rechazo desbloquea la corrección', async () => {
		await page.goto('/reviews');
		await expect(
			page.locator('tr, li').filter({ visible: true }).filter({ hasText: workName })
		).toHaveCount(0);
	});
});
