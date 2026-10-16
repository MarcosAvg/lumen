import { expect, test, type Page } from '@playwright/test';

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
