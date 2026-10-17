import { expect, test } from '@playwright/test';
import { ensureAdmin, photoFile } from './helpers';

const DUMMY_UUID = '00000000-0000-4000-8000-000000000000';
const TECH_PASSWORD = 'contrasena-segura';

test('los técnicos no pueden exportar el ZIP', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const unique = `${testInfo.project.name}-exp-${Date.now()}`;
	const serviceName = `Servicio ${unique}`;
	const techName = `Técnico ${unique}`;
	const techUsername = `tech${unique}`.replace(/[^a-z0-9]/gi, '');

	await ensureAdmin(page);

	// Crear servicio y obtener su id.
	await page.goto('/admin/services');
	await page.getByRole('button', { name: 'Nuevo servicio' }).click();
	await page.locator('#contractId').selectOption({ label: 'General' });
	await page.getByLabel('Nombre', { exact: true }).fill(serviceName);
	await page.getByRole('button', { name: 'Crear servicio' }).click();
	await expect(page.getByText('Servicio creado.')).toBeVisible();

	const serviceHref = await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: serviceName })
		.getByRole('link', { name: serviceName })
		.getAttribute('href');
	const serviceId = (serviceHref ?? '').split('/').pop() ?? '';

	// Admin: ve el botón, el acceso a asignaciones y el endpoint no responde 403.
	await page.goto(serviceHref ?? '/admin/services');
	await expect(page.getByRole('button', { name: 'Exportar ZIP' })).toBeVisible();
	expect((await page.request.get(`/api/services/${serviceId}/export.zip`)).status()).not.toBe(403);

	// El botón abre el modal de configuración de exportación.
	await page.getByRole('button', { name: 'Exportar ZIP' }).click();
	const exportDialog = page.getByRole('dialog');
	await expect(exportDialog.getByRole('heading', { name: 'Exportar evidencias' })).toBeVisible();
	await expect(exportDialog.getByRole('button', { name: 'Simple' })).toBeVisible();
	await expect(exportDialog.getByRole('button', { name: 'Extendida' })).toBeVisible();
	await exportDialog.getByRole('button', { name: 'Cancelar' }).click();

	// Crear un trabajo directo para probar el ZIP de trabajo.
	await page.getByRole('button', { name: 'Nuevo trabajo' }).click();
	await page.getByRole('tab', { name: 'Nombre propio' }).click();
	await page.getByRole('dialog').getByText('Directo', { exact: true }).click();
	await page.locator('#work-name').fill(`Trabajo ${unique}`);
	await page.getByRole('button', { name: 'Crear trabajo' }).click();
	await expect(page.getByText('Trabajo creado.')).toBeVisible();
	const workId = (
		(await page
			.locator('tr, li')
			.filter({ visible: true })
			.filter({ hasText: `Trabajo ${unique}` })
			.getByRole('link', { name: `Trabajo ${unique}` })
			.getAttribute('href')) ?? ''
	)
		.split('/')
		.pop();

	// Subir una foto, enviar y aprobar (para probar la opción de fotografías).
	await page.goto(`/works/${workId}`);
	await page.locator('input[type="file"]').first().setInputFiles(photoFile());
	await page.getByRole('button', { name: 'Enviar evidencia' }).click();
	await page.getByRole('button', { name: 'Confirmar envío' }).click();
	await expect(page.getByText('En revisión').first()).toBeVisible();
	await page.goto('/reviews');
	await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: `Trabajo ${unique}` })
		.getByRole('link')
		.first()
		.click();
	await page.getByRole('button', { name: 'Aprobar entrega' }).click();
	await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
	await expect(page.getByText('Aprobada').first()).toBeVisible();

	// Contrato «General» (contrato por defecto de los E2E) para el ZIP de contrato.
	await page.goto('/contracts');
	const contractHref = await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: 'General' })
		.getByRole('link', { name: 'General' })
		.first()
		.getAttribute('href');
	const contractId = (contractHref ?? '').split('/').pop() ?? '';

	// El admin puede exportar contrato, servicio y trabajo; el ZIP de contrato
	// incluye el registro XLSX en la raíz del contrato.
	const contractZip = await page.request.get(`/api/contracts/${contractId}/export.zip`);
	expect(contractZip.status()).toBe(200);
	expect(contractZip.headers()['content-type']).toContain('zip');
	const contractBody = await contractZip.body();
	expect(contractBody.includes(Buffer.from('General/General.xlsx'))).toBe(true);
	expect((await page.request.get(`/api/services/${serviceId}/export.zip`)).status()).toBe(200);
	expect((await page.request.get(`/api/works/${workId}/export.zip`)).status()).toBe(200);

	// Opciones del modal en servidor: sin fotografías / sin XLSX / variante simple.
	const withPhotos = await page.request.get(`/api/services/${serviceId}/export.zip`);
	const photosBody = await withPhotos.body();
	expect(photosBody.includes(Buffer.from('.jpg'))).toBe(true);
	// El PDF de evidencia vive en la carpeta del trabajo (junto a las fotos).
	expect(
		photosBody.includes(Buffer.from(`${serviceName}/Trabajo ${unique}/Trabajo ${unique}.pdf`))
	).toBe(true);
	const withoutPhotos = await page.request.get(`/api/services/${serviceId}/export.zip?photos=0`);
	const noPhotosBody = await withoutPhotos.body();
	expect(noPhotosBody.includes(Buffer.from('.jpg'))).toBe(false);
	// Sin fotografías, el PDF cae directamente en la carpeta del servicio.
	expect(noPhotosBody.includes(Buffer.from(`${serviceName}/Trabajo ${unique}.pdf`))).toBe(true);
	const withoutXlsx = await page.request.get(`/api/services/${serviceId}/export.zip?xlsx=0`);
	expect((await withoutXlsx.body()).includes(Buffer.from('.xlsx'))).toBe(false);
	const withoutPdf = await page.request.get(`/api/services/${serviceId}/export.zip?pdf=0`);
	expect((await withoutPdf.body()).includes(Buffer.from('.pdf'))).toBe(false);
	expect(
		(await page.request.get(`/api/services/${serviceId}/export.zip?variant=simple`)).status()
	).toBe(200);

	// Desde la ficha se abre el modal de asignaciones.
	await page.goto(serviceHref ?? '/admin/services');
	await page.getByRole('button', { name: 'Gestionar asignaciones' }).click();
	await expect(
		page.getByRole('dialog').getByRole('heading', { name: 'Participantes', exact: true })
	).toBeVisible();
	await page
		.getByRole('dialog')
		.locator('[data-slot="dialog-footer"]')
		.getByRole('button', { name: 'Cerrar' })
		.click();

	// Crear un técnico y asignarlo al servicio.
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Nuevo usuario' }).click();
	const createDialog = page.getByRole('dialog');
	await createDialog.locator('#new-displayName').fill(techName);
	await createDialog.locator('#new-username').fill(techUsername);
	await createDialog.locator('#new-password').fill(TECH_PASSWORD);
	await createDialog.locator('#new-role').selectOption('technician');
	await createDialog.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(page.getByText('Usuario creado.')).toBeVisible();

	// Añadirlo al contrato «General» antes de asignarle el servicio.
	await page.goto('/contracts');
	await page
		.locator('tr, li')
		.filter({ visible: true })
		.filter({ hasText: 'General' })
		.getByRole('link', { name: 'General' })
		.first()
		.click();
	await page.getByRole('button', { name: 'Gestionar participantes' }).click();
	const membersDialog = page.getByRole('dialog');
	await membersDialog.getByRole('button', { name: 'Técnico', exact: true }).click();
	await membersDialog.locator('#participant-user').selectOption({ label: techName });
	await membersDialog.getByRole('button', { name: 'Añadir' }).first().click();
	await expect(page.getByText('Participante añadido.')).toBeVisible();

	await page.goto(serviceHref ?? '/admin/services');
	await page.getByRole('button', { name: 'Gestionar asignaciones' }).click();
	const assignDialog = page.getByRole('dialog');
	await assignDialog.getByRole('button', { name: 'Técnico', exact: true }).click();
	await assignDialog.locator('#participant-user').selectOption({ label: techName });
	await assignDialog.getByRole('button', { name: 'Añadir' }).first().click();
	await expect(page.getByText('Asignación guardada.')).toBeVisible();

	// Revocar pide confirmación en modal (se cancela para conservar la asignación).
	await assignDialog.getByRole('button', { name: 'Revocar' }).click();
	const revokeDialog = page.getByRole('alertdialog');
	await expect(revokeDialog).toBeVisible();
	await revokeDialog.getByRole('button', { name: 'Cancelar' }).click();
	await expect(revokeDialog).toBeHidden();

	// Entrar como técnico.
	await page.context().clearCookies();
	await page.goto('/');
	await page.getByLabel('Usuario').fill(techUsername);
	await page.getByLabel('Contraseña').fill(TECH_PASSWORD);
	await page.getByRole('button', { name: 'Entrar' }).click();
	await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();

	// El técnico ve el servicio pero no puede exportar ni asignar.
	await page.goto(serviceHref ?? '/dashboard');
	await expect(page.getByRole('heading', { name: serviceName })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Exportar ZIP' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Gestionar asignaciones' })).toHaveCount(0);
	expect((await page.request.get(`/api/services/${serviceId}/export.zip`)).status()).toBe(403);
	expect((await page.request.get(`/api/works/${workId}/export.zip`)).status()).toBe(403);
	expect((await page.request.get(`/api/contracts/${contractId}/export.zip`)).status()).toBe(403);
	expect((await page.request.get(`/api/submissions/${DUMMY_UUID}/export.zip`)).status()).toBe(403);
});
