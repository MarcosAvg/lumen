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
	listAttentionWorks,
	listContractPulse,
	listRecentDecisions,
	listRecentEvidencePhotos,
	listServicePulse,
	reviewTrend
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

		const technicianAttention = await listAttentionWorks(db, technician);
		expect(technicianAttention.map((work) => work.workName)).toEqual(['W-A']);
		expect(technicianAttention[0]).toMatchObject({
			status: 'rejected',
			mode: 'direct',
			serviceName: 'Alfa',
			elementTotal: 1,
			elementRejected: 1,
			rejectionReason: 'Falta la placa de características'
		});

		const adminAttention = await listAttentionWorks(db, admin);
		expect(adminAttention.map((work) => work.workName).sort()).toEqual(['W-A', 'W-B']);
	});

	it('DASH-06: la evidencia reciente respeta el ámbito y conserva el contexto', async () => {
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
		const workB = await createWork(db, {
			serviceId: serviceB.id,
			mode: 'direct',
			name: 'W-B',
			actorId: admin.id
		});
		await upload(storage, workA.targetId as string, admin.id);
		await upload(storage, workB.targetId as string, admin.id);

		const technicianPhotos = await listRecentEvidencePhotos(db, technician, 10);
		expect(technicianPhotos).toHaveLength(1);
		expect(technicianPhotos[0]).toMatchObject({
			workId: workA.id,
			workName: 'W-A',
			serviceName: 'Alfa',
			status: 'in_progress'
		});

		const adminPhotos = await listRecentEvidencePhotos(db, admin, 10);
		expect(adminPhotos.map((photo) => photo.workName).sort()).toEqual(['W-A', 'W-B']);
		expect(await listRecentEvidencePhotos(db, admin, 1)).toHaveLength(1);
	});

	it('DASH-07: el panel ampliado agrega estado, alcance y actividad', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const supervisor = await seedUser(admin.id, 'supervisor');
		const contractId = await seedContract(db, admin.id);
		const service = await createService(db, {
			contractId,
			name: 'Servicio panel',
			actorId: admin.id
		});
		await assignUser(db, {
			serviceId: service.id,
			userId: supervisor.id,
			role: 'supervisor',
			actorId: admin.id
		});
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo panel',
			actorId: admin.id
		});
		const photo = await upload(storage, work.targetId as string, admin.id);
		const submission = await submitEvidence(db, {
			targetId: work.targetId as string,
			expectedVersion: photo.version,
			userId: admin.id
		});
		await reviewSubmission(db, {
			submissionId: submission.submissionId,
			decision: 'approved',
			reviewerId: admin.id
		});

		const summary = await dashboardSummary(db, admin);
		expect(summary.statusCounts.approved).toBe(1);
		expect(summary.statusCounts.total).toBe(1);
		expect(summary.approvedLast7).toBe(1);
		expect(summary.contractCount).toBeGreaterThan(0);
		expect(summary.activeUsers).toBeGreaterThan(0);

		const contracts = await listContractPulse(db, 20);
		expect(contracts.find((row) => row.contractId === contractId)).toMatchObject({
			serviceCount: 1,
			totalTargets: 1,
			approvedTargets: 1,
			pendingReviews: 0,
			rejectedTargets: 0
		});

		const services = await listServicePulse(db, supervisor, 20);
		expect(services.find((row) => row.serviceId === service.id)).toMatchObject({
			totalTargets: 1,
			approvedTargets: 1,
			pendingReviews: 0,
			rejectedTargets: 0
		});

		const decisions = await listRecentDecisions(db, supervisor, 10);
		expect(decisions.find((row) => row.submissionId === submission.submissionId)).toMatchObject({
			decision: 'approved',
			serviceName: 'Servicio panel',
			workName: 'Trabajo panel'
		});

		const trend = await reviewTrend(db, supervisor, 30);
		expect(trend).toHaveLength(30);
		expect(trend.reduce((sum, point) => sum + point.submitted, 0)).toBe(1);
		expect(trend.reduce((sum, point) => sum + point.approved, 0)).toBe(1);
	});

	it('DASH-02: los elementos se agrupan con su trabajo padre', async () => {
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

		const attention = await listAttentionWorks(db, admin);
		expect(attention).toHaveLength(1);
		expect(attention[0]).toMatchObject({
			workId: divided.id,
			workName: 'Edificio',
			mode: 'divided',
			status: 'pending',
			elementTotal: 1,
			elementApproved: 0,
			elementPending: 1
		});
	});

	it('DASH-05: un trabajo dividido con elementos en distinto estado es una fila', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio',
			actorId: admin.id
		});
		const divided = await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Edificio',
			elements: [{ name: 'E1' }, { name: 'E2' }, { name: 'E3' }],
			actorId: admin.id
		});

		// E1 rechazado, E2 aprobado y E3 pendiente: el trabajo queda en una fila.
		const targetE1 = await getTargetForElement(db, divided.elementIds[0]);
		const photo = await upload(storage, targetE1.id, admin.id);
		const submission = await submitEvidence(db, {
			targetId: targetE1.id,
			expectedVersion: photo.version,
			userId: admin.id
		});
		await reviewSubmission(db, {
			submissionId: submission.submissionId,
			decision: 'rejected',
			reason: 'Falta etiqueta',
			reviewerId: admin.id
		});

		const targetE2 = await getTargetForElement(db, divided.elementIds[1]);
		const photoE2 = await upload(storage, targetE2.id, admin.id);
		const submissionE2 = await submitEvidence(db, {
			targetId: targetE2.id,
			expectedVersion: photoE2.version,
			userId: admin.id
		});
		await reviewSubmission(db, {
			submissionId: submissionE2.submissionId,
			decision: 'approved',
			reviewerId: admin.id
		});

		const attention = await listAttentionWorks(db, admin);
		expect(attention).toHaveLength(1);
		expect(attention[0]).toMatchObject({
			workId: divided.id,
			mode: 'divided',
			status: 'rejected',
			elementTotal: 3,
			elementApproved: 1,
			elementRejected: 1,
			elementPending: 1,
			rejectionReason: 'Falta etiqueta'
		});

		const summary = await dashboardSummary(db, admin);
		expect(summary.workTotal).toBe(1);
		expect(summary.workApproved).toBe(0);
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
