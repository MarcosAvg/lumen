import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { hashPassword } from '#lib/server/auth/password';
import { DomainError } from '#lib/server/domain/errors';
import { appendPhoto } from '#lib/server/domain/photos';
import { createRequirement } from '#lib/server/domain/requirements';
import { createService } from '#lib/server/domain/services';
import {
	convertWorkMode,
	deleteElement,
	deleteService,
	deleteWork,
	getWorkForConversion,
	getWorkImpact
} from '#lib/server/domain/structure';
import { reviewSubmission, submitEvidence } from '#lib/server/domain/submissions';
import { createFirstAdmin } from '#lib/server/domain/users';
import { createElement, createWork } from '#lib/server/domain/works';
import {
	auditEvents,
	elements,
	evidenceSubmissions,
	evidenceTargets,
	photoRequirements,
	photos,
	services,
	submissionPhotos,
	works
} from '#lib/server/db/schema';
import { createStorage, type Storage } from '#lib/server/storage/storage';
import { removeUnreferencedFiles } from '#lib/server/storage/orphans';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

async function png(): Promise<Buffer> {
	return sharp({
		create: { width: 60, height: 40, channels: 3, background: { r: 20, g: 80, b: 160 } }
	})
		.png()
		.toBuffer();
}

await describeWithDatabase('Cambios estructurales y destrucción', ({ db, client }) => {
	const tempRoots: string[] = [];

	beforeEach(async () => {
		await truncateAll(client);
	});

	afterAll(async () => {
		for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
	});

	async function seedAdmin(): Promise<string> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
		return id;
	}

	async function makeStorage(): Promise<Storage> {
		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-struct-'));
		tempRoots.push(dir);
		const storage = createStorage(dir);
		await storage.ensure();
		return storage;
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

	it('WORK-03: la conversión es imposible con cualquier entrega histórica', async () => {
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
		await reviewSubmission(db, {
			submissionId: submission.submissionId,
			decision: 'rejected',
			reason: 'Corregir',
			reviewerId: admin
		});

		await expect(
			convertWorkMode(db, {
				workId: work.id,
				targetMode: 'divided',
				actorId: admin,
				elements: [{ name: 'E1' }],
				requirements: [],
				additionalPhotos: [{ photoId: photo.photo.id, elementIndex: 0 }]
			})
		).rejects.toBeInstanceOf(DomainError);

		const [row] = await db.select({ mode: works.mode }).from(works).where(eq(works.id, work.id));
		expect(row.mode).toBe('direct');
		const elementRows = await db.select().from(elements).where(eq(elements.workId, work.id));
		expect(elementRows).toHaveLength(0);
	});

	it('WORK-04: sin entregas exige reasignar todo o no cambia nada', async () => {
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
		const inRequirement = await upload(storage, targetId, admin, requirement.id);
		const additional = await upload(storage, targetId, admin, null);

		// Mapeo incompleto: falta la foto adicional.
		await expect(
			convertWorkMode(db, {
				workId: work.id,
				targetMode: 'divided',
				actorId: admin,
				elements: [{ name: 'E1' }],
				requirements: [{ requirementId: requirement.id, elementIndex: 0 }],
				additionalPhotos: []
			})
		).rejects.toBeInstanceOf(DomainError);

		// Cancelado sin cambios: sigue directo, con su objetivo y su requisito.
		const [stillDirect] = await db
			.select({ mode: works.mode })
			.from(works)
			.where(eq(works.id, work.id));
		expect(stillDirect.mode).toBe('direct');
		expect(await db.select().from(elements).where(eq(elements.workId, work.id))).toHaveLength(0);
		expect(
			await db.select().from(evidenceTargets).where(eq(evidenceTargets.workId, work.id))
		).toHaveLength(1);

		// Mapeo completo: convierte a dividido.
		const result = await convertWorkMode(db, {
			workId: work.id,
			targetMode: 'divided',
			actorId: admin,
			elements: [{ name: 'E1' }, { name: 'E2' }],
			requirements: [{ requirementId: requirement.id, elementIndex: 0 }],
			additionalPhotos: [{ photoId: additional.photo.id, elementIndex: 1 }]
		});
		expect(result.mode).toBe('divided');

		const [converted] = await db
			.select({ mode: works.mode })
			.from(works)
			.where(eq(works.id, work.id));
		expect(converted.mode).toBe('divided');
		const elementRows = await db.select().from(elements).where(eq(elements.workId, work.id));
		expect(elementRows).toHaveLength(2);
		expect(
			await db.select().from(evidenceTargets).where(eq(evidenceTargets.workId, work.id))
		).toHaveLength(0);

		// El requisito y sus fotos se movieron al elemento 1; la adicional al 2.
		const elementTargets = await db
			.select({ id: evidenceTargets.id, elementId: evidenceTargets.elementId })
			.from(evidenceTargets);
		const linked = await db
			.select({ id: evidenceTargets.id })
			.from(evidenceTargets)
			.innerJoin(elements, eq(elements.id, evidenceTargets.elementId))
			.where(eq(elements.workId, work.id));
		expect(linked).toHaveLength(2);
		expect(elementTargets.some((row) => row.id === targetId)).toBe(false);

		const [movedRequirement] = await db
			.select({ targetId: photoRequirements.targetId })
			.from(photoRequirements)
			.where(eq(photoRequirements.id, requirement.id));
		const movedPhoto = await db
			.select({ targetId: photos.targetId })
			.from(photos)
			.where(eq(photos.id, inRequirement.photo.id));
		expect(movedPhoto[0].targetId).toBe(movedRequirement.targetId);

		const [movedAdditional] = await db
			.select({ targetId: photos.targetId })
			.from(photos)
			.where(eq(photos.id, additional.photo.id));
		expect(movedAdditional.targetId).not.toBe(movedRequirement.targetId);
	});

	it('convierte de dividido a directo unificando la evidencia', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Dividido',
			actorId: admin
		});
		const e1 = await createElement(db, { workId: work.id, name: 'E1', actorId: admin });
		const e2 = await createElement(db, { workId: work.id, name: 'E2', actorId: admin });
		const r1 = await createRequirement(db, {
			targetId: e1.targetId,
			name: 'R1',
			isRequired: true,
			actorId: admin
		});
		const r2 = await createRequirement(db, {
			targetId: e2.targetId,
			name: 'R2',
			isRequired: true,
			actorId: admin
		});

		const result = await convertWorkMode(db, {
			workId: work.id,
			targetMode: 'direct',
			actorId: admin,
			requirements: [r1.id, r2.id],
			additionalPhotos: []
		});
		expect(result.mode).toBe('direct');

		expect(await db.select().from(elements).where(eq(elements.workId, work.id))).toHaveLength(0);
		const directTargets = await db
			.select()
			.from(evidenceTargets)
			.where(eq(evidenceTargets.workId, work.id));
		expect(directTargets).toHaveLength(1);

		const requirements = await db
			.select()
			.from(photoRequirements)
			.where(eq(photoRequirements.targetId, directTargets[0].id));
		expect(requirements).toHaveLength(2);

		// La conversión con un conjunto incompleto se rechaza.
		await expect(
			convertWorkMode(db, {
				workId: work.id,
				targetMode: 'divided',
				actorId: admin,
				elements: [{ name: 'X' }],
				requirements: [],
				additionalPhotos: []
			})
		).rejects.toBeInstanceOf(DomainError);
	});

	it('DEL-01: borra un servicio con historial sin referencias inválidas y aísla otros', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const serviceA = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'A',
			actorId: admin
		});
		const workA = await createWork(db, {
			serviceId: serviceA.id,
			mode: 'direct',
			name: 'WA',
			actorId: admin
		});
		const targetA = workA.targetId as string;
		const photo = await upload(storage, targetA, admin, null);
		const submission = await submitEvidence(db, {
			targetId: targetA,
			expectedVersion: photo.version,
			userId: admin
		});
		await reviewSubmission(db, {
			submissionId: submission.submissionId,
			decision: 'rejected',
			reason: 'Corregir',
			reviewerId: admin
		});

		// Otro servicio que no debe verse afectado.
		const serviceB = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'B',
			actorId: admin
		});
		await createWork(db, { serviceId: serviceB.id, mode: 'direct', name: 'WB', actorId: admin });

		const impact = await getWorkImpact(db, workA.id);
		expect(impact?.submissions).toBe(1);

		const result = await deleteService(db, { serviceId: serviceA.id, actorId: admin });
		expect(result.submissions).toBe(1);
		expect(result.photos).toBe(1);

		expect(await db.select().from(services).where(eq(services.id, serviceA.id))).toHaveLength(0);
		expect(await db.select().from(works).where(eq(works.serviceId, serviceA.id))).toHaveLength(0);
		expect(
			await db.select().from(evidenceTargets).where(eq(evidenceTargets.id, targetA))
		).toHaveLength(0);
		expect(
			await db.select().from(evidenceSubmissions).where(eq(evidenceSubmissions.targetId, targetA))
		).toHaveLength(0);
		expect(await db.select().from(submissionPhotos)).toHaveLength(0);
		expect(await db.select().from(photos).where(eq(photos.id, photo.photo.id))).toHaveLength(0);

		// El otro servicio sigue intacto.
		expect(await db.select().from(services).where(eq(services.id, serviceB.id))).toHaveLength(1);
		expect(await db.select().from(works).where(eq(works.serviceId, serviceB.id))).toHaveLength(1);

		const deletedAudit = await db
			.select()
			.from(auditEvents)
			.where(eq(auditEvents.action, 'service.deleted'));
		expect(deletedAudit).toHaveLength(1);
	});

	it('borra elemento/trabajo y limpia sus binarios huérfanos', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Dividido',
			actorId: admin
		});
		const e1 = await createElement(db, { workId: work.id, name: 'E1', actorId: admin });
		const e2 = await createElement(db, { workId: work.id, name: 'E2', actorId: admin });
		const photo = await upload(storage, e1.targetId, admin, null);

		const deletion = await deleteElement(db, { elementId: e1.id, actorId: admin });
		expect(deletion.photos).toBe(1);
		expect(await db.select().from(elements).where(eq(elements.id, e1.id))).toHaveLength(0);
		expect(await db.select().from(elements).where(eq(elements.id, e2.id))).toHaveLength(1);

		// Limpieza diferida: los binarios ya no están referenciados.
		const removed = await removeUnreferencedFiles(db, storage, deletion.orphanedPaths);
		expect(removed).toBe(2);
		await expect(stat(storage.absolute(storage.objectRelPath(photo.photo.id)))).rejects.toThrow();

		// Borrar el trabajo restante no falla aunque tenga elementos.
		const workDeletion = await deleteWork(db, { workId: work.id, actorId: admin });
		expect(workDeletion.targets).toBeGreaterThanOrEqual(1);
		expect(await db.select().from(works).where(eq(works.id, work.id))).toHaveLength(0);
	});

	it('getWorkForConversion informa requisitos y fotos sin mutar', async () => {
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
		await createRequirement(db, { targetId, name: 'Antes', isRequired: true, actorId: admin });
		await upload(storage, targetId, admin, null);

		const data = await getWorkForConversion(db, work.id);
		expect(data.mode).toBe('direct');
		expect(data.hasSubmissions).toBe(false);
		expect(data.direct?.requirements).toHaveLength(1);
		expect(data.direct?.additionalPhotos).toHaveLength(1);
	});
});
