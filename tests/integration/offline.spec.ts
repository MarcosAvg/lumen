import { beforeEach, expect, it } from 'vitest';
import type { SessionUser } from '#lib/types';
import { hashPassword } from '#lib/server/auth/password';
import { assignUser } from '#lib/server/domain/assignments';
import { getOfflineSnapshot } from '#lib/server/domain/offline';
import { createService } from '#lib/server/domain/services';
import { createFirstAdmin, createUser } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

await describeWithDatabase('OFFLINE · snapshot de consulta', ({ db, client }) => {
	beforeEach(async () => {
		await truncateAll(client);
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

	async function seedTechnician(actorId: string): Promise<SessionUser> {
		const username = `tecnico-${Math.random().toString(36).slice(2, 8)}`;
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createUser(db, {
			username,
			displayName: 'Técnico offline',
			passwordHash,
			role: 'technician',
			actorId
		});
		return { id, username, displayName: 'Técnico offline', role: 'technician' };
	}

	it('incluye solo servicios asignados, estructura, estados y requisitos', async () => {
		const admin = await seedAdmin();
		const technician = await seedTechnician(admin.id);
		const contractId = await seedContract(db, admin.id);

		const service = await createService(db, {
			contractId,
			name: 'Servicio asignado',
			actorId: admin.id
		});
		await createService(db, {
			contractId,
			name: 'Servicio no asignado',
			actorId: admin.id
		});

		await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo directo',
			requirements: [{ name: 'Antes' }],
			requirementIsRequired: true,
			actorId: admin.id
		});
		await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Trabajo dividido',
			elements: [{ name: 'Elemento 1' }],
			requirements: [{ name: 'Después' }],
			requirementIsRequired: false,
			actorId: admin.id
		});
		await assignUser(db, {
			serviceId: service.id,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});

		const snapshot = await getOfflineSnapshot(db, technician);
		expect(snapshot.user).toMatchObject({ id: technician.id, role: 'technician' });
		expect(snapshot.services).toHaveLength(1);

		const [offlineService] = snapshot.services;
		expect(offlineService.name).toBe('Servicio asignado');
		expect(offlineService.works).toHaveLength(2);

		const direct = offlineService.works.find((work) => work.mode === 'direct');
		expect(direct?.requirements.map((requirement) => requirement.name)).toContain('Antes');
		expect(direct?.requirements[0]?.isRequired).toBe(true);

		const divided = offlineService.works.find((work) => work.mode === 'divided');
		expect(divided?.elements).toHaveLength(1);
		expect(divided?.elements[0]?.requirements.map((requirement) => requirement.name)).toContain(
			'Después'
		);
		expect(divided?.elements[0]?.requirements[0]?.isRequired).toBe(false);
		expect(offlineService.progress.totalTargets).toBe(2);
	});
});
