import { beforeEach, expect, it } from 'vitest';
import type { SessionUser } from '#lib/types';
import { hashPassword } from '#lib/server/auth/password';
import { assignUser } from '#lib/server/domain/assignments';
import {
	assignContractUser,
	createContract,
	deleteContract,
	getContractAccess,
	getContractPdfContext,
	listContractAssignments,
	listContractsForUser,
	revokeContractAssignment,
	updateContractPdfMargins
} from '#lib/server/domain/contracts';
import { DomainError } from '#lib/server/domain/errors';
import { createService, getServiceForUser, listServicesForUser } from '#lib/server/domain/services';
import { createFirstAdmin, createUser } from '#lib/server/domain/users';
import { describeWithDatabase, truncateAll } from './helpers/db';

const PASSWORD = 'contrasena-segura';

await describeWithDatabase('CONTRATOS · ámbito y asignaciones', ({ db, client }) => {
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

	async function seedContract(actorId: string, name: string): Promise<string> {
		const { id } = await createContract(db, {
			name: `${name}-${Math.random().toString(36).slice(2, 8)}`,
			actorId
		});
		return id;
	}

	it('CONTRACT-01: sin membresía el contrato es 404 y no se ven sus servicios', async () => {
		const admin = await seedAdmin();
		const outsider = await seedUser(admin.id, 'technician');
		const contractA = await seedContract(admin.id, 'Contrato A');
		const contractB = await seedContract(admin.id, 'Contrato B');

		const serviceA = await createService(db, {
			contractId: contractA,
			name: 'Servicio A',
			actorId: admin.id
		});
		await createService(db, { contractId: contractB, name: 'Servicio B', actorId: admin.id });

		await expect(getContractAccess(db, outsider, contractA)).rejects.toBeInstanceOf(DomainError);
		expect(await listContractsForUser(db, outsider)).toHaveLength(0);
		// Admin ve ambos contratos.
		expect(await listContractsForUser(db, admin)).toHaveLength(2);

		// Técnico miembro del contrato A y asignado al servicio A.
		await assignContractUser(db, {
			contractId: contractA,
			userId: outsider.id,
			role: 'technician',
			actorId: admin.id
		});
		await assignUser(db, {
			serviceId: serviceA.id,
			userId: outsider.id,
			role: 'technician',
			actorId: admin.id
		});
		expect((await listServicesForUser(db, outsider)).map((s) => s.name)).toEqual(['Servicio A']);
		expect((await getServiceForUser(db, outsider, serviceA.id)).service.contractName).toBeTruthy();
	});

	it('CONTRACT-02: un supervisor no puede asignar servicios de otro contrato', async () => {
		const admin = await seedAdmin();
		const supervisor = await seedUser(admin.id, 'supervisor');
		const technician = await seedUser(admin.id, 'technician');
		const contractA = await seedContract(admin.id, 'Contrato A');
		const contractB = await seedContract(admin.id, 'Contrato B');

		await assignContractUser(db, {
			contractId: contractA,
			userId: supervisor.id,
			role: 'supervisor',
			actorId: admin.id
		});
		// El técnico pertenece al contrato B, el servicio es del contrato A.
		await assignContractUser(db, {
			contractId: contractB,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});
		const serviceA = await createService(db, {
			contractId: contractA,
			name: 'Servicio A',
			actorId: admin.id
		});

		// El supervisor del contrato A no puede añadir a un usuario de otro contrato.
		await expect(
			assignUser(db, {
				serviceId: serviceA.id,
				userId: technician.id,
				role: 'technician',
				actorId: supervisor.id
			})
		).rejects.toBeInstanceOf(DomainError);

		// Sí puede con un miembro de su contrato.
		await assignContractUser(db, {
			contractId: contractA,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});
		await assignUser(db, {
			serviceId: serviceA.id,
			userId: technician.id,
			role: 'technician',
			actorId: supervisor.id
		});
		expect((await getServiceForUser(db, technician, serviceA.id)).access).toBe('technician');
	});

	it('CONTRACT-03: revocar del contrato revoca sus servicios y retira el acceso', async () => {
		const admin = await seedAdmin();
		const technician = await seedUser(admin.id, 'technician');
		const contract = await seedContract(admin.id, 'Contrato');
		const service = await createService(db, {
			contractId: contract,
			name: 'Servicio',
			actorId: admin.id
		});

		const membership = await assignContractUser(db, {
			contractId: contract,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});
		await assignUser(db, {
			serviceId: service.id,
			userId: technician.id,
			role: 'technician',
			actorId: admin.id
		});
		expect((await getServiceForUser(db, technician, service.id)).access).toBe('technician');

		const result = await revokeContractAssignment(db, {
			assignmentId: membership.id,
			actorId: admin.id
		});
		expect(result.revokedServiceAssignments).toBe(1);

		await expect(getServiceForUser(db, technician, service.id)).rejects.toBeInstanceOf(DomainError);
		expect(await listContractAssignments(db, contract)).toHaveLength(0);
	});

	it('CONTRACT-05: los márgenes del PDF tienen valores por defecto y se actualizan', async () => {
		const admin = await seedAdmin();
		const contract = await seedContract(admin.id, 'Contrato');

		expect((await getContractPdfContext(db, contract)).margins).toEqual({
			top: 50,
			bottom: 50,
			left: 15,
			right: 15
		});

		await updateContractPdfMargins(db, {
			contractId: contract,
			margins: { top: 70, bottom: 60, left: 20, right: 25 },
			actorId: admin.id
		});
		expect((await getContractPdfContext(db, contract)).margins).toEqual({
			top: 70,
			bottom: 60,
			left: 20,
			right: 25
		});
	});

	it('CONTRACT-04: no se elimina un contrato con servicios', async () => {
		const admin = await seedAdmin();
		const contract = await seedContract(admin.id, 'Con servicios');
		await createService(db, { contractId: contract, name: 'Servicio', actorId: admin.id });

		await expect(
			deleteContract(db, { contractId: contract, actorId: admin.id })
		).rejects.toBeInstanceOf(DomainError);
	});
});
