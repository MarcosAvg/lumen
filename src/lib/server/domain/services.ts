import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { serviceAssignments, services, users } from '#lib/server/db/schema';
import type { AssignmentRole, SessionUser } from '#lib/types';
import { recordAudit } from './audit';
import { DomainError } from './errors';

export interface ServiceSummary {
	id: string;
	name: string;
	description: string | null;
}

export interface CreateServiceInput {
	name: string;
	description?: string | null;
	actorId: string;
}

export async function createService(
	db: Database,
	input: CreateServiceInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const [created] = await tx
			.insert(services)
			.values({
				name: input.name,
				description: input.description?.trim() || null,
				createdBy: input.actorId
			})
			.returning({ id: services.id });

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: created.id,
			entityType: 'service',
			entityId: created.id,
			action: 'service.created',
			metadata: { name: input.name }
		});

		return { id: created.id };
	});
}

/** Administrador: todos los servicios. Resto: solo los servicios asignados activamente. */
export async function listServicesForUser(
	db: Database,
	user: SessionUser
): Promise<ServiceSummary[]> {
	const columns = { id: services.id, name: services.name, description: services.description };

	if (user.role === 'admin') {
		return db.select(columns).from(services).orderBy(asc(services.createdAt));
	}

	const rows = await db
		.selectDistinct({ ...columns, createdAt: services.createdAt })
		.from(services)
		.innerJoin(serviceAssignments, eq(serviceAssignments.serviceId, services.id))
		.where(and(eq(serviceAssignments.userId, user.id), isNull(serviceAssignments.revokedAt)))
		.orderBy(asc(services.createdAt));

	return rows.map(
		({ id, name, description }) => ({ id, name, description }) satisfies ServiceSummary
	);
}

export interface ServiceAccessResult {
	service: ServiceSummary;
	access: 'admin' | AssignmentRole;
}

/**
 * Devuelve el servicio y el nivel de acceso del usuario. Los recursos fuera de
 * ámbito se tratan como inexistentes (`404`) para no filtrar su existencia.
 */
export async function getServiceForUser(
	db: Database,
	user: SessionUser,
	serviceId: string
): Promise<ServiceAccessResult> {
	const [service] = await db
		.select({ id: services.id, name: services.name, description: services.description })
		.from(services)
		.where(eq(services.id, serviceId))
		.limit(1);

	if (!service) throw new DomainError(404, 'Servicio no encontrado.');
	if (user.role === 'admin') return { service, access: 'admin' };

	const [assignment] = await db
		.select({ assignmentRole: serviceAssignments.assignmentRole })
		.from(serviceAssignments)
		.where(
			and(
				eq(serviceAssignments.serviceId, serviceId),
				eq(serviceAssignments.userId, user.id),
				isNull(serviceAssignments.revokedAt)
			)
		)
		.limit(1);

	if (!assignment) throw new DomainError(404, 'Servicio no encontrado.');
	return { service, access: assignment.assignmentRole };
}

export interface Participant {
	userId: string;
	displayName: string;
	assignmentRole: AssignmentRole;
}

export async function listParticipants(db: Database, serviceId: string): Promise<Participant[]> {
	return db
		.select({
			userId: users.id,
			displayName: users.displayName,
			assignmentRole: serviceAssignments.assignmentRole
		})
		.from(serviceAssignments)
		.innerJoin(users, eq(users.id, serviceAssignments.userId))
		.where(and(eq(serviceAssignments.serviceId, serviceId), isNull(serviceAssignments.revokedAt)))
		.orderBy(asc(users.displayName));
}
