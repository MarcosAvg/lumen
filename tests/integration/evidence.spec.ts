import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { hashPassword } from '#lib/server/auth/password';
import { DomainError } from '#lib/server/domain/errors';
import { appendPhoto, loadEvidence, removePhoto, reorderPhotos } from '#lib/server/domain/photos';
import {
	createRequirement,
	deleteRequirement,
	listRequirements
} from '#lib/server/domain/requirements';
import { createService } from '#lib/server/domain/services';
import { createFirstAdmin, createUser } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { evidenceTargets, photos } from '#lib/server/db/schema';
import { createStorage, type Storage } from '#lib/server/storage/storage';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

async function png(width = 400, height = 300): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } })
		.png()
		.toBuffer();
}

await describeWithDatabase('Evidencia · fotos y requisitos', ({ db, client }) => {
	const tempRoots: string[] = [];

	beforeEach(async () => {
		await truncateAll(client);
	});

	afterAll(async () => {
		for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
	});

	async function makeStorage(): Promise<Storage> {
		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-photos-'));
		tempRoots.push(dir);
		const storage = createStorage(dir);
		await storage.ensure();
		return storage;
	}

	async function seed() {
		const passwordHash = await hashPassword(PASSWORD);
		const { id: admin } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
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
		return { admin, serviceId: service.id, targetId: work.targetId as string };
	}

	it('PHOTO-01: dos técnicos suben a la vez y ambas fotos persisten con su autoría', async () => {
		const { admin, targetId } = await seed();
		const passwordHash = await hashPassword(PASSWORD);
		const tech = (
			await createUser(db, {
				username: 'tec',
				displayName: 'Técnica',
				passwordHash,
				role: 'technician',
				actorId: admin
			})
		).id;
		const storage = await makeStorage();

		const [first, second] = await Promise.all([
			appendPhoto(db, storage, {
				targetId,
				requirementId: null,
				buffer: await png(400, 300),
				userId: admin,
				maxDimension: 2560,
				thumbDimension: 400
			}),
			appendPhoto(db, storage, {
				targetId,
				requirementId: null,
				buffer: await png(320, 240),
				userId: tech,
				maxDimension: 2560,
				thumbDimension: 400
			})
		]);

		const evidence = await loadEvidence(db, targetId);
		expect(evidence.photos).toHaveLength(2);
		expect(new Set(evidence.photos.map((photo) => photo.uploadedBy))).toEqual(
			new Set([admin, tech])
		);
		expect(first.version).not.toBe(second.version);
	});

	it('el retiro exige la versión vigente y conserva el archivo (soft removal)', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();
		const { photo, version } = await appendPhoto(db, storage, {
			targetId,
			requirementId: null,
			buffer: await png(),
			userId: admin,
			maxDimension: 2560,
			thumbDimension: 400
		});

		await expect(
			removePhoto(db, {
				targetId,
				photoId: photo.id,
				expectedVersion: version + 5,
				userId: admin
			})
		).rejects.toBeInstanceOf(DomainError);

		const result = await removePhoto(db, {
			targetId,
			photoId: photo.id,
			expectedVersion: version,
			userId: admin
		});
		expect(result.version).toBe(version + 1);

		const evidence = await loadEvidence(db, targetId);
		expect(evidence.photos).toHaveLength(0);

		const [row] = await db.select().from(photos).where(eq(photos.id, photo.id));
		expect(row.removedAt).not.toBeNull();
		await expect(stat(storage.absolute(row.storagePath))).resolves.toBeTruthy();
	});

	it('PHOTO-02: reordenar con versión obsoleta no pisa cambios (409)', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();
		const p1 = await appendPhoto(db, storage, {
			targetId,
			requirementId: null,
			buffer: await png(),
			userId: admin,
			maxDimension: 2560,
			thumbDimension: 400
		});
		const p2 = await appendPhoto(db, storage, {
			targetId,
			requirementId: null,
			buffer: await png(),
			userId: admin,
			maxDimension: 2560,
			thumbDimension: 400
		});
		const p3 = await appendPhoto(db, storage, {
			targetId,
			requirementId: null,
			buffer: await png(),
			userId: admin,
			maxDimension: 2560,
			thumbDimension: 400
		});

		await reorderPhotos(db, {
			targetId,
			requirementId: null,
			orderedIds: [p3.photo.id, p2.photo.id, p1.photo.id],
			expectedVersion: p3.version,
			userId: admin
		});

		await expect(
			reorderPhotos(db, {
				targetId,
				requirementId: null,
				orderedIds: [p1.photo.id, p2.photo.id, p3.photo.id],
				expectedVersion: p1.version,
				userId: admin
			})
		).rejects.toBeInstanceOf(DomainError);

		const evidence = await loadEvidence(db, targetId);
		expect(evidence.photos.map((photo) => photo.id)).toEqual([
			p3.photo.id,
			p2.photo.id,
			p1.photo.id
		]);
	});

	it('rechaza contenido que no es imagen sin crear evidencia', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();

		await expect(
			appendPhoto(db, storage, {
				targetId,
				requirementId: null,
				buffer: Buffer.from('no soy una imagen'),
				userId: admin,
				maxDimension: 2560,
				thumbDimension: 400
			})
		).rejects.toBeInstanceOf(DomainError);

		const evidence = await loadEvidence(db, targetId);
		expect(evidence.photos).toHaveLength(0);
	});

	it('REQ-03: eliminar un requisito mueve sus fotos a Adicionales', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();
		const requirement = await createRequirement(db, {
			targetId,
			name: 'Antes',
			isRequired: true,
			actorId: admin
		});
		await appendPhoto(db, storage, {
			targetId,
			requirementId: requirement.id,
			buffer: await png(),
			userId: admin,
			maxDimension: 2560,
			thumbDimension: 400
		});

		await deleteRequirement(db, { requirementId: requirement.id, actorId: admin });

		const evidence = await loadEvidence(db, targetId);
		expect(await listRequirements(db, targetId)).toHaveLength(0);
		expect(evidence.photos).toHaveLength(1);
		expect(evidence.photos[0].requirementId).toBeNull();
	});

	it('no permite modificar evidencia en estado no editable', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();

		await db
			.update(evidenceTargets)
			.set({ currentStatus: 'approved' })
			.where(eq(evidenceTargets.id, targetId));

		await expect(
			appendPhoto(db, storage, {
				targetId,
				requirementId: null,
				buffer: await png(),
				userId: admin,
				maxDimension: 2560,
				thumbDimension: 400
			})
		).rejects.toBeInstanceOf(DomainError);

		await expect(
			createRequirement(db, { targetId, name: 'Después', isRequired: true, actorId: admin })
		).rejects.toBeInstanceOf(DomainError);
	});
});
