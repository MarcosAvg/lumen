import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { hashPassword } from '#lib/server/auth/password';
import { setContractLifecycle } from '#lib/server/domain/contracts';
import {
	countPendingReviews,
	dashboardSummary,
	listAttentionWorks
} from '#lib/server/domain/dashboard';
import { DomainError } from '#lib/server/domain/errors';
import { appendPhoto } from '#lib/server/domain/photos';
import { assertRequirementsEditable } from '#lib/server/domain/requirements';
import {
	createService,
	getServiceForUser,
	listServicesForUser,
	setServiceLifecycle
} from '#lib/server/domain/services';
import { reviewSubmission, submitEvidence } from '#lib/server/domain/submissions';
import { getTargetForWork } from '#lib/server/domain/targets';
import { createFirstAdmin } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
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

await describeWithDatabase(
	'LIFECYCLE · contratos, servicios y tablero activo',
	({ db, client }) => {
		let storage: Storage;
		let storageDir: string;

		beforeEach(async () => {
			await truncateAll(client);
			storageDir = await mkdtemp(path.join(tmpdir(), 'lumen-lifecycle-'));
			storage = createStorage(storageDir);
			await storage.ensure();
		});

		afterEach(async () => {
			await rm(storageDir, { recursive: true, force: true });
		});

		async function seedAdmin(): Promise<SessionUser> {
			const passwordHash = await hashPassword(PASSWORD);
			const { id } = await createFirstAdmin(db, {
				username: 'admin',
				displayName: 'Admin',
				passwordHash
			});
			return { id, username: 'admin', displayName: 'Admin', role: 'admin' };
		}

		async function approveWork(admin: SessionUser, targetId: string): Promise<void> {
			const photo = await appendPhoto(db, storage, {
				targetId,
				requirementId: null,
				buffer: await png(),
				userId: admin.id,
				maxDimension: 2560,
				thumbDimension: 400
			});
			const submission = await submitEvidence(db, {
				targetId,
				expectedVersion: photo.version,
				userId: admin.id
			});
			await reviewSubmission(db, {
				submissionId: submission.submissionId,
				decision: 'approved',
				reviewerId: admin.id
			});
		}

		it('LIFE-01: planned no captura e inactive pausa', async () => {
			const admin = await seedAdmin();
			const contractId = await seedContract(db, admin.id);
			const service = await createService(db, {
				contractId,
				name: 'Servicio en espera',
				lifecycle: 'planned',
				actorId: admin.id
			});

			expect((await getServiceForUser(db, admin, service.id)).service.lifecycle).toBe('planned');

			// Un contrato con servicios en espera no puede pausarse.
			await expect(
				setContractLifecycle(db, {
					contractId,
					lifecycle: 'inactive',
					actorId: admin.id
				})
			).rejects.toMatchObject({ status: 409 });

			await setServiceLifecycle(db, {
				serviceId: service.id,
				lifecycle: 'active',
				actorId: admin.id
			});
			await setServiceLifecycle(db, {
				serviceId: service.id,
				lifecycle: 'inactive',
				actorId: admin.id
			});

			// Sin trabajos aprobados no se archiva.
			await expect(
				setServiceLifecycle(db, {
					serviceId: service.id,
					lifecycle: 'archived',
					actorId: admin.id
				})
			).rejects.toBeInstanceOf(DomainError);

			await setContractLifecycle(db, {
				contractId,
				lifecycle: 'inactive',
				actorId: admin.id
			});
			await expect(
				createService(db, {
					contractId,
					name: 'No debería crearse',
					actorId: admin.id
				})
			).rejects.toMatchObject({ status: 409 });
		});

		it('LIFE-02: archivar exige trabajos aprobados y bloquea la captura', async () => {
			const admin = await seedAdmin();
			const contractId = await seedContract(db, admin.id);
			const service = await createService(db, {
				contractId,
				name: 'Servicio completo',
				actorId: admin.id
			});
			const work = await createWork(db, {
				serviceId: service.id,
				mode: 'direct',
				name: 'Trabajo',
				actorId: admin.id
			});
			await approveWork(admin, work.targetId as string);

			await setServiceLifecycle(db, {
				serviceId: service.id,
				lifecycle: 'archived',
				actorId: admin.id
			});
			expect((await getServiceForUser(db, admin, service.id)).service.lifecycle).toBe('archived');

			const target = await getTargetForWork(db, work.id);
			await expect(assertRequirementsEditable(db, target.id)).rejects.toBeInstanceOf(DomainError);

			// No se permite saltar de archivado a activo.
			await expect(
				setServiceLifecycle(db, {
					serviceId: service.id,
					lifecycle: 'active',
					actorId: admin.id
				})
			).rejects.toMatchObject({ status: 409 });

			await setContractLifecycle(db, {
				contractId,
				lifecycle: 'archived',
				actorId: admin.id
			});

			// El contrato archivado bloquea desarchivar el servicio.
			await expect(
				setServiceLifecycle(db, {
					serviceId: service.id,
					lifecycle: 'inactive',
					actorId: admin.id
				})
			).rejects.toMatchObject({ status: 409 });

			// No se permite saltar de archivado a activo.
			await expect(
				setContractLifecycle(db, {
					contractId,
					lifecycle: 'active',
					actorId: admin.id
				})
			).rejects.toMatchObject({ status: 409 });

			await setContractLifecycle(db, {
				contractId,
				lifecycle: 'inactive',
				actorId: admin.id
			});
			await setServiceLifecycle(db, {
				serviceId: service.id,
				lifecycle: 'inactive',
				actorId: admin.id
			});
			await setContractLifecycle(db, {
				contractId,
				lifecycle: 'active',
				actorId: admin.id
			});
			await setServiceLifecycle(db, {
				serviceId: service.id,
				lifecycle: 'active',
				actorId: admin.id
			});
			expect((await getServiceForUser(db, admin, service.id)).service.lifecycle).toBe('active');
		});

		it('LIFE-03: el tablero solo cuenta servicios activos', async () => {
			const admin = await seedAdmin();
			const contractId = await seedContract(db, admin.id);
			const service = await createService(db, {
				contractId,
				name: 'Servicio activo',
				actorId: admin.id
			});
			await createWork(db, {
				serviceId: service.id,
				mode: 'direct',
				name: 'Trabajo pendiente',
				actorId: admin.id
			});

			expect((await listAttentionWorks(db, admin)).length).toBe(1);
			const activeSummary = await dashboardSummary(db, admin);
			expect(activeSummary.serviceCount).toBe(1);
			expect(activeSummary.contractCount).toBe(1);

			await setServiceLifecycle(db, {
				serviceId: service.id,
				lifecycle: 'inactive',
				actorId: admin.id
			});

			expect(await listAttentionWorks(db, admin)).toHaveLength(0);
			const pausedSummary = await dashboardSummary(db, admin);
			expect(pausedSummary.serviceCount).toBe(0);
			expect(pausedSummary.totalTargets).toBe(0);
			expect(await countPendingReviews(db, admin)).toBe(0);

			const listed = await listServicesForUser(db, admin);
			expect(listed.find((row) => row.id === service.id)?.lifecycle).toBe('inactive');
		});
	}
);
