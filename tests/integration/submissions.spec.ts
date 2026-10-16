import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { hashPassword } from '#lib/server/auth/password';
import { DomainError } from '#lib/server/domain/errors';
import {
	appendPhoto,
	getPhotoAccessContext,
	isPhotoAvailable,
	loadEvidence,
	removePhoto
} from '#lib/server/domain/photos';
import { createRequirement } from '#lib/server/domain/requirements';
import { createService } from '#lib/server/domain/services';
import {
	getHistory,
	getSubmissionDetail,
	reviewSubmission,
	submitEvidence
} from '#lib/server/domain/submissions';
import { createFirstAdmin, createUser } from '#lib/server/domain/users';
import { createElement, createWork } from '#lib/server/domain/works';
import { reviews, submissionPhotos } from '#lib/server/db/schema';
import { createStorage, type Storage } from '#lib/server/storage/storage';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

async function png(width = 400, height = 300): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 90, g: 140, b: 200 } } })
		.png()
		.toBuffer();
}

await describeWithDatabase('Entregas y revisiones', ({ db, client }) => {
	const tempRoots: string[] = [];

	beforeEach(async () => {
		await truncateAll(client);
	});

	afterAll(async () => {
		for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
	});

	async function makeStorage(): Promise<Storage> {
		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-sub-'));
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

	async function upload(
		storage: Storage,
		targetId: string,
		userId: string,
		requirementId: string | null = null
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

	it('REQ-01: no se envía sin foto en un requisito obligatorio', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();
		await createRequirement(db, { targetId, name: 'Antes', isRequired: true, actorId: admin });
		const { version } = await upload(storage, targetId, admin, null);

		await expect(
			submitEvidence(db, { targetId, expectedVersion: version, userId: admin })
		).rejects.toBeInstanceOf(DomainError);
	});

	it('REQ-02: sin requisitos obligatorios y sin fotos no se envía', async () => {
		const { admin, targetId } = await seed();
		await expect(
			submitEvidence(db, { targetId, expectedVersion: 0, userId: admin })
		).rejects.toBeInstanceOf(DomainError);
	});

	it('SUB-01/02: versión obsoleta falla y no se puede reenviar en in_review', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();
		const { version } = await upload(storage, targetId, admin, null);

		await expect(
			submitEvidence(db, { targetId, expectedVersion: version - 1, userId: admin })
		).rejects.toBeInstanceOf(DomainError);

		const submitted = await submitEvidence(db, {
			targetId,
			expectedVersion: version,
			userId: admin
		});
		expect(submitted.sequenceNo).toBe(1);

		// Ya no es editable: ni reenviar ni subir.
		await expect(
			submitEvidence(db, { targetId, expectedVersion: submitted.version, userId: admin })
		).rejects.toBeInstanceOf(DomainError);
		await expect(upload(storage, targetId, admin, null)).rejects.toBeInstanceOf(DomainError);
	});

	it('REV-01: el rechazo exige motivo', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();
		const { version } = await upload(storage, targetId, admin, null);
		const submission = await submitEvidence(db, {
			targetId,
			expectedVersion: version,
			userId: admin
		});

		await expect(
			reviewSubmission(db, {
				submissionId: submission.submissionId,
				decision: 'rejected',
				reason: '   ',
				reviewerId: admin
			})
		).rejects.toBeInstanceOf(DomainError);

		const pending = await getSubmissionDetail(db, submission.submissionId);
		expect(pending.review).toBeNull();
	});

	it('REV-02: dos revisores concurrentes producen una sola decisión', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();
		const supervisor = (
			await createUser(db, {
				username: 'sup',
				displayName: 'Supervisora',
				passwordHash: await hashPassword(PASSWORD),
				role: 'supervisor',
				actorId: admin
			})
		).id;
		const { version } = await upload(storage, targetId, admin, null);
		const submission = await submitEvidence(db, {
			targetId,
			expectedVersion: version,
			userId: admin
		});

		const results = await Promise.allSettled([
			reviewSubmission(db, {
				submissionId: submission.submissionId,
				decision: 'approved',
				reviewerId: admin
			}),
			reviewSubmission(db, {
				submissionId: submission.submissionId,
				decision: 'rejected',
				reason: 'Falta una foto',
				reviewerId: supervisor
			})
		]);

		const fulfilled = results.filter((result) => result.status === 'fulfilled');
		expect(fulfilled).toHaveLength(1);

		const rows = await db
			.select()
			.from(reviews)
			.where(eq(reviews.submissionId, submission.submissionId));
		expect(rows).toHaveLength(1);
	});

	it('REV-03: rechazo, corrección y reenvío conservan la entrega anterior', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();

		const photoA = await upload(storage, targetId, admin, null);
		const first = await submitEvidence(db, {
			targetId,
			expectedVersion: photoA.version,
			userId: admin
		});
		await reviewSubmission(db, {
			submissionId: first.submissionId,
			decision: 'rejected',
			reason: 'Falta la foto de después',
			reviewerId: admin
		});

		// REQ-04: con un envío previo, los requisitos quedan congelados.
		await expect(
			createRequirement(db, { targetId, name: 'Después', isRequired: true, actorId: admin })
		).rejects.toBeInstanceOf(DomainError);

		// Corrige: retira A y añade B; luego reenvía.
		const afterReject = await loadEvidence(db, targetId);
		await removePhoto(db, {
			targetId,
			photoId: photoA.photo.id,
			expectedVersion: afterReject.target.version,
			userId: admin
		});
		const photoB = await upload(storage, targetId, admin, null);
		const second = await submitEvidence(db, {
			targetId,
			expectedVersion: photoB.version,
			userId: admin
		});
		await reviewSubmission(db, {
			submissionId: second.submissionId,
			decision: 'approved',
			reviewerId: admin
		});

		const history = await getHistory(db, targetId);
		expect(history).toHaveLength(2);
		expect(history[0].sequenceNo).toBe(2);
		expect(history[0].decision).toBe('approved');
		expect(history[1].sequenceNo).toBe(1);
		expect(history[1].decision).toBe('rejected');
		expect(history[1].reason).toBe('Falta la foto de después');

		// La entrega #1 conserva sus fotos originales aunque A se retiró del borrador.
		const firstDetail = await getSubmissionDetail(db, first.submissionId);
		expect(firstDetail.photos.map((photo) => photo.photoId)).toContain(photoA.photo.id);
		const [link] = await db
			.select()
			.from(submissionPhotos)
			.where(eq(submissionPhotos.submissionId, first.submissionId));
		expect(link.photoId).toBe(photoA.photo.id);
	});

	it('PHOTO-04: una foto retirada sigue accesible si quedó en una entrega histórica', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();

		const historical = await upload(storage, targetId, admin, null);
		const first = await submitEvidence(db, {
			targetId,
			expectedVersion: historical.version,
			userId: admin
		});
		await reviewSubmission(db, {
			submissionId: first.submissionId,
			decision: 'rejected',
			reason: 'Repetir la foto',
			reviewerId: admin
		});

		// Se retira la foto usada en la entrega #1.
		const afterReject = await loadEvidence(db, targetId);
		await removePhoto(db, {
			targetId,
			photoId: historical.photo.id,
			expectedVersion: afterReject.target.version,
			userId: admin
		});

		const context = await getPhotoAccessContext(db, historical.photo.id);
		expect(context.removedAt).not.toBeNull();
		expect(context.historicalReference).toBe(true);
		expect(isPhotoAvailable(context)).toBe(true);

		// Una foto retirada que nunca formó parte de una entrega no es accesible.
		const draftOnly = await upload(storage, targetId, admin, null);
		const before = await loadEvidence(db, targetId);
		await removePhoto(db, {
			targetId,
			photoId: draftOnly.photo.id,
			expectedVersion: before.target.version,
			userId: admin
		});
		const orphanContext = await getPhotoAccessContext(db, draftOnly.photo.id);
		expect(orphanContext.removedAt).not.toBeNull();
		expect(orphanContext.historicalReference).toBe(false);
		expect(isPhotoAvailable(orphanContext)).toBe(false);
	});

	it('la aprobación bloquea el objetivo sin afectar a otros elementos', async () => {
		const { admin, serviceId } = await seed();
		const storage = await makeStorage();
		const work = await createWork(db, {
			serviceId,
			mode: 'divided',
			name: 'Piso',
			actorId: admin
		});
		const e1 = await createElement(db, { workId: work.id, name: 'UMA 1', actorId: admin });
		const e2 = await createElement(db, { workId: work.id, name: 'UMA 2', actorId: admin });

		const photo1 = await upload(storage, e1.targetId, admin, null);
		const sub1 = await submitEvidence(db, {
			targetId: e1.targetId,
			expectedVersion: photo1.version,
			userId: admin
		});
		await reviewSubmission(db, {
			submissionId: sub1.submissionId,
			decision: 'approved',
			reviewerId: admin
		});

		await expect(upload(storage, e1.targetId, admin, null)).rejects.toBeInstanceOf(DomainError);
		// El otro elemento sigue editable.
		await expect(upload(storage, e2.targetId, admin, null)).resolves.toBeTruthy();
	});

	it('carrera retirar frente a enviar deja un resultado consistente', async () => {
		const { admin, targetId } = await seed();
		const storage = await makeStorage();
		const p1 = await upload(storage, targetId, admin, null);
		await upload(storage, targetId, admin, null);
		const versionAtStart = (await loadEvidence(db, targetId)).target.version;

		const results = await Promise.allSettled([
			removePhoto(db, {
				targetId,
				photoId: p1.photo.id,
				expectedVersion: versionAtStart,
				userId: admin
			}),
			submitEvidence(db, { targetId, expectedVersion: versionAtStart, userId: admin })
		]);

		const fulfilled = results.filter((result) => result.status === 'fulfilled');
		expect(fulfilled).toHaveLength(1);

		// El snapshot, si se envió, registra exactamente las fotos vigentes en ese momento.
		const history = await getHistory(db, targetId);
		if (history.length > 0) {
			const detail = await getSubmissionDetail(db, history[0].id);
			expect(detail.photos.length).toBeGreaterThan(0);
		}
	});
});
