import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { hashPassword } from '#lib/server/auth/password';
import { appendPhoto } from '#lib/server/domain/photos';
import { createCatalog, createCatalogItem } from '#lib/server/domain/catalogs';
import { createContract } from '#lib/server/domain/contracts';
import { createRequirement } from '#lib/server/domain/requirements';
import { createService, updateService } from '#lib/server/domain/services';
import {
	getContractArchive,
	getServiceArchive,
	getSubmissionArchive,
	getWorkArchive
} from '#lib/server/domain/exports';
import {
	listPendingReviews,
	reviewSubmission,
	submitEvidence
} from '#lib/server/domain/submissions';
import { createFirstAdmin } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { getTargetForElement } from '#lib/server/domain/targets';
import { NameRegistry, sanitizeSegment } from '#lib/server/exports/names';
import { searchByName } from '#lib/server/domain/search';
import { DomainError } from '#lib/server/domain/errors';
import { createStorage, type Storage } from '#lib/server/storage/storage';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

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
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Mantenimiento Central',
			actorId: admin
		});
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
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});
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

	it('EXP-01b: una entrega sin requisitos usa la carpeta «Fotografías»', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo',
			actorId: admin
		});
		const targetId = work.targetId as string;
		const photo = await upload(storage, targetId, admin, null);
		const submission = await submitEvidence(db, {
			targetId,
			expectedVersion: photo.version,
			userId: admin
		});

		const archive = await getSubmissionArchive(db, submission.submissionId);
		expect(archive.files.map((file) => file.path)).toEqual(['entrega-1/Fotografías/01.jpg']);
	});

	it('EXP-02: el ZIP de servicio incluye solo aprobados y resume los omitidos', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});
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
		// Solo evidencia aprobada; el trabajo en revisión no aporta carpetas.
		expect(archive.files.map((file) => file.path)).toEqual([
			'Servicio/Aprobado/Fotografías/01.jpg'
		]);
	});

	it('EXP-03: el ZIP de trabajo agrupa por elemento', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});
		const divided = await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Dividido',
			elements: [{ name: 'UMA 1' }, { name: 'UMA 2' }],
			actorId: admin
		});

		// Aprobar el objetivo de «UMA 1».
		const target = await getTargetForElement(db, divided.elementIds[0]);
		const photo = await upload(storage, target.id, admin, null);
		const submission = await submitEvidence(db, {
			targetId: target.id,
			expectedVersion: photo.version,
			userId: admin
		});
		await reviewSubmission(db, {
			submissionId: submission.submissionId,
			decision: 'approved',
			reviewerId: admin
		});

		const workArchive = await getWorkArchive(db, divided.id);
		expect(workArchive.files.map((file) => file.path)).toEqual([
			'Dividido/UMA 1/Fotografías/01.jpg'
		]);
		// Desde el servicio, el mismo trabajo cuelga bajo su nombre.
		const serviceArchive = await getServiceArchive(db, service.id);
		expect(serviceArchive.files.map((file) => file.path)).toEqual([
			'Servicio/Dividido/UMA 1/Fotografías/01.jpg'
		]);
	});

	it('EXP-04: el ZIP de contrato agrupa por edificio y servicio', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const contractId = (await createContract(db, { name: 'Contrato', actorId: admin })).id;

		const catalog = await createCatalog(db, { name: `Edificios-${Date.now()}`, actorId: admin });
		const torre = await createCatalogItem(db, {
			catalogId: catalog.id,
			name: 'Torre',
			actorId: admin
		});
		const nave = await createCatalogItem(db, {
			catalogId: catalog.id,
			name: 'Nave',
			actorId: admin
		});

		const serviceTorre = await createService(db, {
			contractId,
			name: 'UMAs Torre',
			actorId: admin
		});
		await updateService(db, {
			serviceId: serviceTorre.id,
			name: 'UMAs Torre',
			buildingCatalogItemId: torre.id,
			actorId: admin
		});
		const serviceNave = await createService(db, {
			contractId,
			name: 'Bombas Nave',
			actorId: admin
		});
		await updateService(db, {
			serviceId: serviceNave.id,
			name: 'Bombas Nave',
			buildingCatalogItemId: nave.id,
			actorId: admin
		});

		for (const serviceId of [serviceTorre.id, serviceNave.id]) {
			const work = await createWork(db, {
				serviceId,
				mode: 'direct',
				name: 'Trabajo',
				actorId: admin
			});
			const photo = await upload(storage, work.targetId as string, admin, null);
			const submission = await submitEvidence(db, {
				targetId: work.targetId as string,
				expectedVersion: photo.version,
				userId: admin
			});
			await reviewSubmission(db, {
				submissionId: submission.submissionId,
				decision: 'approved',
				reviewerId: admin
			});
		}

		const archive = await getContractArchive(db, contractId);
		expect(archive.files.map((file) => file.path)).toEqual([
			'Contrato/Nave/Bombas Nave/Trabajo/Fotografías/01.jpg',
			'Contrato/Torre/UMAs Torre/Trabajo/Fotografías/01.jpg'
		]);
	});

	it('sanea nombres de ZIP y desambigua duplicados', () => {
		expect(sanitizeSegment('../../etc/passwd')).not.toContain('/');
		expect(sanitizeSegment('  ')).toBe('sin-nombre');
		expect(sanitizeSegment('UMA 03 · Piso 34')).toContain('UMA 03');

		const registry = new NameRegistry();
		expect(registry.unique('Piso', 'aaaaaa')).toBe('Piso');
		expect(registry.unique('Piso', 'bbbbbb')).toBe('Piso (bbbbbb)');
	});

	it('la cola de revisión filtra y pagina en servidor', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const serviceA = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Alfa',
			actorId: admin
		});
		const serviceB = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Beta',
			actorId: admin
		});

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
