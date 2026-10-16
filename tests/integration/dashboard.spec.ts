import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { hashPassword } from '#lib/server/auth/password';
import { assignUser } from '#lib/server/domain/assignments';
import {
	countPendingReviews,
	dashboardSummary,
	listAttentionTargets
} from '#lib/server/domain/dashboard';
import { appendPhoto } from '#lib/server/domain/photos';
import { searchByName } from '#lib/server/domain/search';
import { createService } from '#lib/server/domain/services';
import { reviewSubmission, submitEvidence } from '#lib/server/domain/submissions';
import { createFirstAdmin, createUser } from '#lib/server/domain/users';
import { createWork, listServiceProgress } from '#lib/server/domain/works';
import { getTargetForElement } from '#lib/server/domain/targets';
import { createStorage, type Storage } from '#lib/server/storage/storage';
import type { SessionUser } from '#lib/types';
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

await describeWithDatabase('DASH · tablero por rol', ({ db, client }) => {
	const tempRoots: string[] = [];

	beforeEach(async () => {
		await truncateAll(client);
	});

	afterAll(async () => {
		for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
	});

	async function makeStorage(): Promise<Storage> {
		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-dash-'));
		tempRoots.push(dir);
		const storage = createStorage(dir);
		await storage.ensure();
		return storage;
	}

	async function seedAdmin(): Promise<SessionUser> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
		return { id, username: 'admin', displayName: 'Admin', role: 'admin' };
	}

	async function seedUser(
		actorId: string,
		role: 'supervisor' | 'technician'
	): Promise<SessionUser> {
		const username = `${role}-${Math.random().toString(36).slice(2, 8)}`;
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createUser(db, {
			username,
			displayName: `Usuario ${role}`,
			passwordHash,
			role,
			actorId
		});
		return { id, username, displayName: `Usuario ${role}`, role };
	}

	async function upload(
		storage: Storage,
		targetId: string,
		userId: string
	): Promise<{ version: number; photoId: string }> {
		return appendPhoto(db, storage, {
			targetId,
			requirementId: null,
			buffer: await png(),
			userId,
			maxDimension: 2560,
			thumbDimension: 400
		});
	}

	it('DASH-01: la atención se acota al ámbito y destaca los rechazos', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const technician = await seedUser(admin.id, 'technician');

		const serviceA = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Alfa',
			actorId: admin.id
		});
		const serviceB = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Beta',
			actorId: admin.id
		});
		await assignUser(db, {
			serviceId: serviceA.id,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});

		const workA = await createWork(db, {
			serviceId: serviceA.id,
			mode: 'direct',
			name: 'W-A',
			actorId: admin.id
		});
		await createWork(db, {
			serviceId: serviceB.id,
			mode: 'direct',
			name: 'W-B',
			actorId: admin.id
		});

		// A: entregar y rechazar.
		const photoA = await upload(storage, workA.targetId as string, admin.id);
		const submissionA = await submitEvidence(db, {
			targetId: workA.targetId as string,
			expectedVersion: photoA.version,
			userId: admin.id
		});
		await reviewSubmission(db, {
			submissionId: submissionA.submissionId,
			decision: 'rejected',
			reason: 'Falta la placa de características',
			reviewerId: admin.id
		});

		const technicianAttention = await listAttentionTargets(db, technician);
		expect(technicianAttention.map((target) => target.label)).toEqual(['W-A']);
		expect(technicianAttention[0].status).toBe('rejected');
		expect(technicianAttention[0].rejectionReason).toBe('Falta la placa de características');
		expect(technicianAttention[0].serviceName).toBe('Alfa');

		const adminAttention = await listAttentionTargets(db, admin);
		expect(adminAttention.map((target) => target.label).sort()).toEqual(['W-A', 'W-B']);
	});

	it('DASH-02: los objetivos de elementos se resuelven con su trabajo padre', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio',
			actorId: admin.id
		});
		const divided = await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Edificio',
			elements: [{ name: 'UMA 03' }],
			actorId: admin.id
		});
		const target = await getTargetForElement(db, divided.elementIds[0]);

		const attention = await listAttentionTargets(db, admin);
		expect(attention).toHaveLength(1);
		expect(attention[0]).toMatchObject({
			type: 'element',
			id: divided.elementIds[0],
			label: 'UMA 03',
			workName: 'Edificio',
			status: 'pending',
			targetId: target.id
		});
	});

	it('DASH-04: el progreso por servicio se agrega en una consulta', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio',
			actorId: admin.id
		});
		const direct = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Directo',
			actorId: admin.id
		});
		await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Dividido',
			elements: [{ name: 'E1' }, { name: 'E2' }],
			actorId: admin.id
		});

		// Aprobar el objetivo directo.
		const photo = await upload(storage, direct.targetId as string, admin.id);
		const submission = await submitEvidence(db, {
			targetId: direct.targetId as string,
			expectedVersion: photo.version,
			userId: admin.id
		});
		await reviewSubmission(db, {
			submissionId: submission.submissionId,
			decision: 'approved',
			reviewerId: admin.id
		});

		const progress = await listServiceProgress(db, [service.id]);
		expect(progress.get(service.id)).toEqual({ totalTargets: 3, approvedTargets: 1 });
	});

	it('DASH-03: el contador de revisiones respeta el rol y el ámbito', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const supervisorA = await seedUser(admin.id, 'supervisor');
		const supervisorB = await seedUser(admin.id, 'supervisor');
		const technician = await seedUser(admin.id, 'technician');

		const serviceA = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Alfa',
			actorId: admin.id
		});
		const serviceB = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Beta',
			actorId: admin.id
		});
		await assignUser(db, {
			serviceId: serviceA.id,
			userId: supervisorA.id,
			role: 'supervisor',
			actorId: admin.id
		});
		await assignUser(db, {
			serviceId: serviceB.id,
			userId: supervisorB.id,
			role: 'supervisor',
			actorId: admin.id
		});

		const workA = await createWork(db, {
			serviceId: serviceA.id,
			mode: 'direct',
			name: 'W-A',
			actorId: admin.id
		});
		const photoA = await upload(storage, workA.targetId as string, admin.id);
		await submitEvidence(db, {
			targetId: workA.targetId as string,
			expectedVersion: photoA.version,
			userId: admin.id
		});

		expect(await countPendingReviews(db, admin)).toBe(1);
		expect(await countPendingReviews(db, supervisorA)).toBe(1);
		expect(await countPendingReviews(db, supervisorB)).toBe(0);
		expect(await countPendingReviews(db, technician)).toBe(0);

		const summary = await dashboardSummary(db, { id: admin.id, role: 'admin' });
		expect(summary.pendingReviews).toBe(1);
		expect(summary.serviceCount).toBe(2);
		expect(summary.totalTargets).toBe(1);
	});
});

await describeWithDatabase('SEARCH · filtros por tipo y servicio', ({ db, client }) => {
	beforeEach(async () => {
		await truncateAll(client);
	});

	async function seedAdmin() {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
		return { id, username: 'admin', displayName: 'Admin', role: 'admin' as const };
	}

	it('SEARCH-02: filtra por tipo y por servicio dentro del ámbito', async () => {
		const admin = await seedAdmin();
		const serviceA = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Central',
			actorId: admin.id
		});
		const serviceB = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Central',
			actorId: admin.id
		});
		await createWork(db, {
			serviceId: serviceA.id,
			mode: 'direct',
			name: 'UMA 03',
			actorId: admin.id
		});
		await createWork(db, {
			serviceId: serviceB.id,
			mode: 'direct',
			name: 'UMA 04',
			actorId: admin.id
		});

		const all = await searchByName(db, admin, 'uma');
		expect(all.map((result) => result.label).sort()).toEqual(['UMA 03', 'UMA 04']);

		const worksOnly = await searchByName(db, admin, 'uma', { types: ['work'] });
		expect(worksOnly).toHaveLength(2);
		const servicesOnly = await searchByName(db, admin, 'uma', { types: ['service'] });
		expect(servicesOnly).toHaveLength(0);

		const byService = await searchByName(db, admin, 'uma', { serviceId: serviceA.id });
		expect(byService.map((result) => result.label)).toEqual(['UMA 03']);

		// Un servicio fuera de ámbito se trata como inexistente.
		const outsider = {
			id: crypto.randomUUID(),
			username: 'tec',
			displayName: 'Tec',
			role: 'technician' as const
		};
		expect(await searchByName(db, outsider, 'uma', { serviceId: serviceB.id })).toHaveLength(0);
	});
});
