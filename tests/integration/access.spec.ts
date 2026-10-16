import { beforeEach, expect, it } from 'vitest';
import type { SessionUser } from '#lib/types';
import { hashPassword } from '#lib/server/auth/password';
import {
	assignUser,
	listServiceAssignments,
	revokeAssignment
} from '#lib/server/domain/assignments';
import { DomainError } from '#lib/server/domain/errors';
import { createService, getServiceForUser, listServicesForUser } from '#lib/server/domain/services';
import { createFirstAdmin, createUser, setUserActive } from '#lib/server/domain/users';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

await describeWithDatabase('AUTH · ámbito por servicio y asignaciones', ({ db, client }) => {
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

	it('AUTH-01: un técnico no asignado no accede al servicio', async () => {
		const admin = await seedAdmin();
		const technician = await seedUser(admin.id, 'technician');
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio A',
			actorId: admin.id
		});

		await expect(getServiceForUser(db, technician, service.id)).rejects.toBeInstanceOf(DomainError);
		expect(await listServicesForUser(db, technician)).toHaveLength(0);
	});

	it('un técnico asignado accede y aparece en su lista', async () => {
		const admin = await seedAdmin();
		const technician = await seedUser(admin.id, 'technician');
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio A',
			actorId: admin.id
		});
		await assignUser(db, {
			serviceId: service.id,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});

		const access = await getServiceForUser(db, technician, service.id);
		expect(access.access).toBe('technician');
		expect(await listServicesForUser(db, technician)).toHaveLength(1);
	});

	it('un supervisor accede solo tras ser asignado', async () => {
		const admin = await seedAdmin();
		const supervisor = await seedUser(admin.id, 'supervisor');
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio B',
			actorId: admin.id
		});

		await expect(getServiceForUser(db, supervisor, service.id)).rejects.toBeInstanceOf(DomainError);

		await assignUser(db, {
			serviceId: service.id,
			userId: supervisor.id,
			role: 'supervisor',
			actorId: admin.id
		});
		expect((await getServiceForUser(db, supervisor, service.id)).access).toBe('supervisor');
	});

	it('el administrador accede a cualquier servicio sin asignación', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio C',
			actorId: admin.id
		});
		expect((await getServiceForUser(db, admin, service.id)).access).toBe('admin');
	});

	it('revocar la asignación retira el acceso de inmediato', async () => {
		const admin = await seedAdmin();
		const technician = await seedUser(admin.id, 'technician');
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio D',
			actorId: admin.id
		});
		const assignment = await assignUser(db, {
			serviceId: service.id,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});

		await revokeAssignment(db, { assignmentId: assignment.id, actorId: admin.id });

		await expect(getServiceForUser(db, technician, service.id)).rejects.toBeInstanceOf(DomainError);
		expect(await listServiceAssignments(db, service.id)).toHaveLength(0);
	});

	it('rechaza una asignación cuyo rol no coincide con el rol global', async () => {
		const admin = await seedAdmin();
		const technician = await seedUser(admin.id, 'technician');
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio E',
			actorId: admin.id
		});

		await expect(
			assignUser(db, {
				serviceId: service.id,
				userId: technician.id,
				role: 'supervisor',
				actorId: admin.id
			})
		).rejects.toBeInstanceOf(DomainError);
	});

	it('no asigna usuarios inactivos y evita duplicados activos', async () => {
		const admin = await seedAdmin();
		const technician = await seedUser(admin.id, 'technician');
		const service = await createService(db, {
			contractId: await seedContract(db, admin.id),
			name: 'Servicio F',
			actorId: admin.id
		});

		const first = await assignUser(db, {
			serviceId: service.id,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});
		const second = await assignUser(db, {
			serviceId: service.id,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});
		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(await listServiceAssignments(db, service.id)).toHaveLength(1);

		await setUserActive(db, { userId: technician.id, active: false, actorId: admin.id });
		await expect(
			assignUser(db, {
				serviceId: service.id,
				userId: technician.id,
				role: 'technician',
				actorId: admin.id
			})
		).rejects.toBeInstanceOf(DomainError);
	});
});
