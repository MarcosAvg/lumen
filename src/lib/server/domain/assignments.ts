import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { contractAssignments, serviceAssignments, services, users } from '#lib/server/db/schema';
import type { AssignmentRole, Role } from '#lib/types';
import { recordAudit } from './audit';
import { DomainError } from './errors';

export interface AssignmentItem {
	id: string;
	userId: string;
	displayName: string;
	assignmentRole: AssignmentRole;
	assignedAt: Date;
}

export async function listServiceAssignments(
	db: Database,
	serviceId: string
): Promise<AssignmentItem[]> {
	return db
		.select({
			id: serviceAssignments.id,
			userId: users.id,
			displayName: users.displayName,
			assignmentRole: serviceAssignments.assignmentRole,
			assignedAt: serviceAssignments.assignedAt
		})
		.from(serviceAssignments)
		.innerJoin(users, eq(users.id, serviceAssignments.userId))
		.where(and(eq(serviceAssignments.serviceId, serviceId), isNull(serviceAssignments.revokedAt)))
		.orderBy(asc(users.displayName));
}

export interface AssignableUser {
	id: string;
	username: string;
	displayName: string;
	role: Role;
}

/** Usuarios activos que pueden recibir asignaciones (técnicos y supervisores). */
export async function listAssignableUsers(db: Database): Promise<AssignableUser[]> {
	return db
		.select({
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			role: users.role
		})
		.from(users)
		.where(and(eq(users.isActive, true), inArray(users.role, ['technician', 'supervisor'])))
		.orderBy(asc(users.displayName));
}

export interface AssignUserInput {
	serviceId: string;
	userId: string;
	role: AssignmentRole;
	actorId: string;
}

export async function assignUser(
	db: Database,
	input: AssignUserInput
): Promise<{ id: string; created: boolean }> {
	return db.transaction(async (tx) => {
		const [service] = await tx
			.select({ id: services.id, contractId: services.contractId })
			.from(services)
			.where(eq(services.id, input.serviceId))
			.limit(1);
		if (!service) throw new DomainError(404, 'Servicio no encontrado.');

		const [user] = await tx
			.select({ id: users.id, role: users.role, isActive: users.isActive })
			.from(users)
			.where(eq(users.id, input.userId))
			.limit(1);
		if (!user) throw new DomainError(404, 'Usuario no encontrado.');
		if (!user.isActive) throw new DomainError(409, 'El usuario no está activo.');
		if (user.role !== input.role) {
			throw new DomainError(
				409,
				'El rol de la asignación no coincide con el rol global del usuario.'
			);
		}

		// Solo pueden asignarse servicios a participantes del contrato del servicio.
		// El administrador (ámbito global) incorpora al usuario al contrato si no lo
		// estaba; un supervisor solo puede asignar a miembros existentes.
		const [member] = await tx
			.select({ id: contractAssignments.id })
			.from(contractAssignments)
			.where(
				and(
					eq(contractAssignments.contractId, service.contractId),
					eq(contractAssignments.userId, input.userId),
					eq(contractAssignments.assignmentRole, input.role),
					isNull(contractAssignments.revokedAt)
				)
			)
			.limit(1);
		if (!member) {
			const [actor] = await tx
				.select({ role: users.role })
				.from(users)
				.where(eq(users.id, input.actorId))
				.limit(1);
			if (actor?.role !== 'admin') {
				throw new DomainError(
					409,
					'El usuario no es participante del contrato de este servicio. Añádelo al contrato primero.'
				);
			}
			await tx.insert(contractAssignments).values({
				contractId: service.contractId,
				userId: input.userId,
				assignmentRole: input.role,
				assignedBy: input.actorId
			});
		}

		const [existing] = await tx
			.select({ id: serviceAssignments.id })
			.from(serviceAssignments)
			.where(
				and(
					eq(serviceAssignments.serviceId, input.serviceId),
					eq(serviceAssignments.userId, input.userId),
					eq(serviceAssignments.assignmentRole, input.role),
					isNull(serviceAssignments.revokedAt)
				)
			)
			.limit(1);
		if (existing) return { id: existing.id, created: false };

		const [created] = await tx
			.insert(serviceAssignments)
			.values({
				serviceId: input.serviceId,
				userId: input.userId,
				assignmentRole: input.role,
				assignedBy: input.actorId
			})
			.returning({ id: serviceAssignments.id });

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: input.serviceId,
			entityType: 'service_assignment',
			entityId: created.id,
			action: 'assignment.created',
			metadata: { userId: input.userId, role: input.role }
		});

		return { id: created.id, created: true };
	});
}

/** Servicio al que pertenece una asignación (para autorizar antes de revocar). */
export async function getAssignmentServiceId(db: Database, assignmentId: string): Promise<string> {
	const [row] = await db
		.select({ serviceId: serviceAssignments.serviceId })
		.from(serviceAssignments)
		.where(eq(serviceAssignments.id, assignmentId))
		.limit(1);
	if (!row) throw new DomainError(404, 'Asignación no encontrada.');
	return row.serviceId;
}

export interface RevokeAssignmentInput {
	assignmentId: string;
	actorId: string;
}

export async function revokeAssignment(
	db: Database,
	input: RevokeAssignmentInput
): Promise<{ serviceId: string }> {
	return db.transaction(async (tx) => {
		const [assignment] = await tx
			.select()
			.from(serviceAssignments)
			.where(eq(serviceAssignments.id, input.assignmentId))
			.limit(1);
		if (!assignment) throw new DomainError(404, 'Asignación no encontrada.');
		if (assignment.revokedAt) return { serviceId: assignment.serviceId };

		await tx
			.update(serviceAssignments)
			.set({ revokedAt: new Date() })
			.where(eq(serviceAssignments.id, input.assignmentId));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: assignment.serviceId,
			entityType: 'service_assignment',
			entityId: input.assignmentId,
			action: 'assignment.revoked',
			metadata: { userId: assignment.userId, role: assignment.assignmentRole }
		});

		return { serviceId: assignment.serviceId };
	});
}
