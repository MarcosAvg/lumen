import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { hashPassword } from '#lib/server/auth/password';
import { DomainError } from '#lib/server/domain/errors';
import { appendPhoto } from '#lib/server/domain/photos';
import { createService } from '#lib/server/domain/services';
import {
	getHistory,
	getSubmissionDetail,
	reviewSubmission,
	submitEvidence
} from '#lib/server/domain/submissions';
import { createFirstAdmin, createUser, deleteUser } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { createStorage, type Storage } from '#lib/server/storage/storage';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

async function png(): Promise<Buffer> {
	return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 5, g: 5, b: 5 } } })
		.png()
		.toBuffer();
}

await describeWithDatabase('Eliminación de usuarios con firma histórica', ({ db, client }) => {
	const tempRoots: string[] = [];

	beforeEach(async () => {
		await truncateAll(client);
	});

	afterAll(async () => {
		for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
	});

	async function makeStorage(): Promise<Storage> {
		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-users-'));
		tempRoots.push(dir);
		const storage = createStorage(dir);
		await storage.ensure();
		return storage;
	}

	async function seedAdmin(): Promise<string> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin Uno',
			passwordHash
		});
		return id;
	}

	it('conserva el nombre del autor tras eliminar su cuenta', async () => {
		const admin = await seedAdmin();
		const passwordHash = await hashPassword(PASSWORD);
		const { id: technician } = await createUser(db, {
			username: 'tecnico',
			displayName: 'Técnico Firma',
			passwordHash,
			role: 'technician',
			actorId: admin
		});

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

		const photo = await appendPhoto(db, storage, {
			targetId,
			requirementId: null,
			buffer: await png(),
			userId: technician,
			maxDimension: 2560,
			thumbDimension: 400
		});
		const submission = await submitEvidence(db, {
			targetId,
			expectedVersion: photo.version,
			userId: technician
		});
		await reviewSubmission(db, {
			submissionId: submission.submissionId,
			decision: 'rejected',
			reason: 'Corregir',
			reviewerId: admin
		});

		// Firma antes de eliminar.
		let [history] = await getHistory(db, targetId);
		expect(history.submittedByName).toBe('Técnico Firma');
		let detail = await getSubmissionDetail(db, submission.submissionId);
		expect(detail.submission.submittedByName).toBe('Técnico Firma');
		expect(detail.photos[0].uploadedByName).toBe('Técnico Firma');
		expect(detail.review?.reviewerName).toBe('Admin Uno');

		// Se elimina la cuenta del técnico.
		await deleteUser(db, { userId: technician, actorId: admin });

		// El historial conserva la firma (nombre congelado), sin «eliminado».
		[history] = await getHistory(db, targetId);
		expect(history.submittedByName).toBe('Técnico Firma');
		detail = await getSubmissionDetail(db, submission.submissionId);
		expect(detail.submission.submittedByName).toBe('Técnico Firma');
		expect(detail.photos[0].uploadedByName).toBe('Técnico Firma');
		expect(detail.review?.reviewerName).toBe('Admin Uno');
	});

	it('no permite eliminar al último administrador activo', async () => {
		const admin = await seedAdmin();
		await expect(deleteUser(db, { userId: admin, actorId: admin })).rejects.toBeInstanceOf(
			DomainError
		);

		// Con un segundo administrador, sí se permite.
		const passwordHash = await hashPassword(PASSWORD);
		const { id: second } = await createUser(db, {
			username: 'admin2',
			displayName: 'Admin Dos',
			passwordHash,
			role: 'admin',
			actorId: admin
		});
		await expect(deleteUser(db, { userId: second, actorId: admin })).resolves.toBeUndefined();
	});
});
