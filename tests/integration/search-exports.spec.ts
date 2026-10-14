import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { hashPassword } from '#lib/server/auth/password';
import { appendPhoto } from '#lib/server/domain/photos';
import { createRequirement } from '#lib/server/domain/requirements';
import { createService } from '#lib/server/domain/services';
import {
	getServicesCsv,
	getServiceArchive,
	getSubmissionArchive
} from '#lib/server/domain/exports';
import {
	listPendingReviews,
	reviewSubmission,
	submitEvidence
} from '#lib/server/domain/submissions';
import { createFirstAdmin } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { NameRegistry, sanitizeSegment } from '#lib/server/exports/names';
import { csvCell, toCsv } from '#lib/server/exports/csv';
import { searchByName } from '#lib/server/domain/search';
import { DomainError } from '#lib/server/domain/errors';
import { createStorage, type Storage } from '#lib/server/storage/storage';
import { describeWithDatabase, truncateAll } from './helpers/db';

const PASSWORD = 'contrasena-segura';

async function png(): Promise<Buffer> {
	return sharp({
		create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 60, b: 110 } }
	})
		.png()
		.toBuffer();
}

await describeWithDatabase('Búsqueda, exportaciones y paginación', ({ db, client }) => {
	const tempRoots: string[] = [];

	beforeEach(async () => {
		await truncateAll(client);
	});

	afterAll(async () => {
		for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
	});

	async function makeStorage(): Promise<Storage> {
		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-exp-'));
		tempRoots.push(dir);
		const storage = createStorage(dir);
		await storage.ensure();
		return storage;
	}

	async function seedAdmin(): Promise<string> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
		return id;
	}

	async function upload(
		storage: Storage,
		targetId: string,
		userId: string,
		requirementId: string | null
	) {
		return appendPhoto(db, storage, {
			targetId,
			requirementId,
			buffer: await png(),
			userId,
			maxDimension: 2560,
			thumbDimension: 400
		});
	}

	it('SEARCH-01: no devuelve recursos fuera del ámbito del usuario', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, { name: 'Mantenimiento Central', actorId: admin });
		await createWork(db, { serviceId: service.id, mode: 'direct', name: 'UMA 03', actorId: admin });

		const outsider = {
			id: crypto.randomUUID(),
			username: 'tec',
			displayName: 'Tec',
			role: 'technician' as const
		};
		expect(await searchByName(db, outsider, 'UMA')).toHaveLength(0);
		expect(await searchByName(db, outsider, 'Mantenimiento')).toHaveLength(0);

		const adminResults = await searchByName(db, { ...outsider, id: admin, role: 'admin' }, 'uma');
		expect(adminResults.some((result) => result.type === 'work' && result.label === 'UMA 03')).toBe(
			true
		);
	});

	it('EXP-01: el ZIP de entrega usa grupos y orden del snapshot', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const service = await createService(db, { name: 'Servicio', actorId: admin });
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo',
			actorId: admin
		});
		const targetId = work.targetId as string;
		const requirement = await createRequirement(db, {
			targetId,
			name: 'Antes',
			isRequired: true,
			actorId: admin
		});

		const a = await upload(storage, targetId, admin, requirement.id);
		const b = await upload(storage, targetId, admin, requirement.id);
		const c = await upload(storage, targetId, admin, null);

		const submission = await submitEvidence(db, {
			targetId,
			expectedVersion: c.version,
			userId: admin
		});

		const archive = await getSubmissionArchive(db, submission.submissionId);
		expect(archive.fileName).toBe('entrega-1.zip');
		expect(archive.files.map((file) => file.path)).toEqual([
			'entrega-1/Antes/01.jpg',
			'entrega-1/Antes/02.jpg',
			'entrega-1/Adicionales/01.jpg'
		]);
		expect(archive.files.map((file) => file.storagePath)).toEqual([
			storage.objectRelPath(a.photo.id),
			storage.objectRelPath(b.photo.id),
			storage.objectRelPath(c.photo.id)
		]);
	});

	it('EXP-02: el ZIP de servicio incluye solo aprobados y resume los omitidos', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const service = await createService(db, { name: 'Servicio', actorId: admin });
		const approved = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Aprobado',
			actorId: admin
		});
		const pending = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Pendiente',
			actorId: admin
		});

		const approvedPhoto = await upload(storage, approved.targetId as string, admin, null);
		const approvedSubmission = await submitEvidence(db, {
			targetId: approved.targetId as string,
			expectedVersion: approvedPhoto.version,
			userId: admin
		});
		await reviewSubmission(db, {
			submissionId: approvedSubmission.submissionId,
			decision: 'approved',
			reviewerId: admin
		});

		const pendingPhoto = await upload(storage, pending.targetId as string, admin, null);
		await submitEvidence(db, {
			targetId: pending.targetId as string,
			expectedVersion: pendingPhoto.version,
			userId: admin
		});

		const archive = await getServiceArchive(db, service.id);
		expect(archive.files).toHaveLength(1);
		expect(archive.files[0].path).toBe('Servicio/Aprobado/Adicionales/01.jpg');
		expect(archive.resumen).toContain('Aprobado');
		expect(archive.resumen).toContain('Pendiente');
		expect(archive.resumen).toContain('Omitido: En revisión');
	});

	it('el CSV administrativo neutraliza fórmulas y respeta el filtro de estado', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const service = await createService(db, { name: 'Servicio', actorId: admin });
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: '=SUM(A1)',
			actorId: admin
		});
		const photo = await upload(storage, work.targetId as string, admin, null);
		await submitEvidence(db, {
			targetId: work.targetId as string,
			expectedVersion: photo.version,
			userId: admin
		});

		const csv = await getServicesCsv(db, {});
		expect(csv.content.startsWith('\uFEFF')).toBe(true);
		expect(csv.content).toContain("'=SUM(A1)");
		// Una entrega enviada cuenta como 1.
		expect(csv.content).toContain('Trabajo directo,En revisión,1,');

		// El filtro por estado excluye las unidades que no coinciden.
		const approvedOnly = await getServicesCsv(db, { status: 'approved' });
		expect(approvedOnly.content).not.toContain('=SUM(A1)');
	});

	it('sanea nombres de ZIP y desambigua duplicados', () => {
		expect(sanitizeSegment('../../etc/passwd')).not.toContain('/');
		expect(sanitizeSegment('  ')).toBe('sin-nombre');
		expect(sanitizeSegment('UMA 03 · Piso 34')).toContain('UMA 03');

		const registry = new NameRegistry();
		expect(registry.unique('Piso', 'aaaaaa')).toBe('Piso');
		expect(registry.unique('Piso', 'bbbbbb')).toBe('Piso (bbbbbb)');
		expect(csvCell('=1+1')).toBe("'=1+1");
		expect(csvCell('hola,mundo')).toBe('"hola,mundo"');
		expect(toCsv([['a']])).toBe('a\r\n');
	});

	it('la cola de revisión filtra y pagina en servidor', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const serviceA = await createService(db, { name: 'Alfa', actorId: admin });
		const serviceB = await createService(db, { name: 'Beta', actorId: admin });

		for (const [service, name] of [
			[serviceA, 'W1'],
			[serviceA, 'W2'],
			[serviceB, 'W3']
		] as const) {
			const work = await createWork(db, {
				serviceId: service.id,
				mode: 'direct',
				name,
				actorId: admin
			});
			const photo = await upload(storage, work.targetId as string, admin, null);
			await submitEvidence(db, {
				targetId: work.targetId as string,
				expectedVersion: photo.version,
				userId: admin
			});
		}

		const adminUser = { id: admin, role: 'admin' };
		const all = await listPendingReviews(db, adminUser, { limit: 2, offset: 0 });
		expect(all.total).toBe(3);
		expect(all.items).toHaveLength(2);

		const secondPage = await listPendingReviews(db, adminUser, { limit: 2, offset: 2 });
		expect(secondPage.items).toHaveLength(1);

		const byService = await listPendingReviews(db, adminUser, { serviceId: serviceB.id });
		expect(byService.total).toBe(1);
		expect(byService.items[0].serviceName).toBe('Beta');

		const byText = await listPendingReviews(db, adminUser, { q: 'W1' });
		expect(byText.total).toBe(1);
	});

	it('getSubmissionArchive falla si la entrega no existe', async () => {
		await seedAdmin();
		await expect(
			getSubmissionArchive(db, '00000000-0000-0000-0000-000000000000')
		).rejects.toBeInstanceOf(DomainError);
	});
});
