import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { hashPassword } from '#lib/server/auth/password';
import { DomainError } from '#lib/server/domain/errors';
import { appendPhoto } from '#lib/server/domain/photos';
import { createService } from '#lib/server/domain/services';
import { getHistory, submitEvidence } from '#lib/server/domain/submissions';
import {
	createFirstAdmin,
	createUser,
	listUsers,
	updateUserProfile
} from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { createStorage, type Storage } from '#lib/server/storage/storage';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

async function png(): Promise<Buffer> {
	return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 9, g: 9, b: 9 } } })
		.png()
		.toBuffer();
}

await describeWithDatabase('Edición de usuarios', ({ db, client }) => {
	const tempRoots: string[] = [];

	beforeEach(async () => {
		await truncateAll(client);
	});

	afterAll(async () => {
		for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
	});

	async function makeStorage(): Promise<Storage> {
		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-profile-'));
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

	it('edita el nombre visible y el usuario (normalizado)', async () => {
		const admin = await seedAdmin();
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createUser(db, {
			username: 'tecnico',
			displayName: 'Técnico Uno',
			passwordHash,
			role: 'technician',
			actorId: admin
		});

		await updateUserProfile(db, {
			userId: id,
			username: '  Tecnico.Dos ',
			displayName: 'Técnico Dos',
			actorId: admin
		});

		const users = await listUsers(db);
		const updated = users.find((user) => user.id === id);
		expect(updated?.username).toBe('tecnico.dos');
		expect(updated?.displayName).toBe('Técnico Dos');
	});

	it('rechaza un nombre de usuario repetido', async () => {
		const admin = await seedAdmin();
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createUser(db, {
			username: 'tecnico',
			displayName: 'Técnico',
			passwordHash,
			role: 'technician',
			actorId: admin
		});
		await createUser(db, {
			username: 'otro',
			displayName: 'Otro',
			passwordHash,
			role: 'technician',
			actorId: admin
		});

		await expect(
			updateUserProfile(db, {
				userId: id,
				username: 'otro',
				displayName: 'Técnico',
				actorId: admin
			})
		).rejects.toBeInstanceOf(DomainError);
	});

	it('mantiene la firma histórica al renombrar', async () => {
		const admin = await seedAdmin();
		const passwordHash = await hashPassword(PASSWORD);
		const { id: technician } = await createUser(db, {
			username: 'tecnico',
			displayName: 'Nombre Original',
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
		await submitEvidence(db, { targetId, expectedVersion: photo.version, userId: technician });

		await updateUserProfile(db, {
			userId: technician,
			username: 'tecnico',
			displayName: 'Nombre Nuevo',
			actorId: admin
		});

		const [history] = await getHistory(db, targetId);
		expect(history.submittedByName).toBe('Nombre Original');
	});
});
