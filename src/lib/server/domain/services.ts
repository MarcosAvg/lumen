import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { catalogItems, serviceAssignments, services, users } from '#lib/server/db/schema';
import type { AssignmentRole, SessionUser } from '#lib/types';
import { recordAudit } from './audit';
import { DomainError } from './errors';

const visibleBuildingName = sql<
	string | null
>`coalesce(${catalogItems.name}, ${services.buildingNameSnapshot})`;

export interface ServiceSummary {
	id: string;
	name: string;
	description: string | null;
	buildingName: string | null;
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

export interface UpdateServiceInput {
	serviceId: string;
	name: string;
	description?: string | null;
	/** `undefined` conserva el edificio actual; `null` lo quita; un id lo vincula. */
	buildingCatalogItemId?: string | null;
	actorId: string;
}

/** Edita nombre, descripción y edificio sin alterar entregas ni revisiones. */
export async function updateService(db: Database, input: UpdateServiceInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [current] = await tx
			.select({ id: services.id })
			.from(services)
			.where(eq(services.id, input.serviceId))
			.limit(1);
		if (!current) throw new DomainError(404, 'Servicio no encontrado.');

		const values: Partial<typeof services.$inferInsert> = {
			name: input.name,
			description: input.description?.trim() || null,
			updatedAt: new Date()
		};

		if (input.buildingCatalogItemId !== undefined) {
			if (input.buildingCatalogItemId === null) {
				values.buildingCatalogItemId = null;
				values.buildingNameSnapshot = null;
			} else {
				const [item] = await tx
					.select({ id: catalogItems.id, name: catalogItems.name })
					.from(catalogItems)
					.where(eq(catalogItems.id, input.buildingCatalogItemId))
					.limit(1);
				if (!item) throw new DomainError(404, 'Ítem de edificio no encontrado.');
				values.buildingCatalogItemId = item.id;
				values.buildingNameSnapshot = item.name;
			}
		}

		await tx.update(services).set(values).where(eq(services.id, input.serviceId));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: input.serviceId,
			entityType: 'service',
			entityId: input.serviceId,
			action: 'service.updated',
			metadata: { name: input.name }
		});
	});
}

const serviceColumns = {
	id: services.id,
	name: services.name,
	description: services.description,
	buildingName: visibleBuildingName
};

/** Administrador: todos los servicios. Resto: solo los servicios asignados activamente. */
export async function listServicesForUser(
	db: Database,
	user: SessionUser
): Promise<ServiceSummary[]> {
	if (user.role === 'admin') {
		return db
			.select(serviceColumns)
			.from(services)
			.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
			.orderBy(asc(services.createdAt));
	}

	const rows = await db
		.selectDistinct({ ...serviceColumns, sortKey: services.createdAt })
		.from(services)
		.innerJoin(serviceAssignments, eq(serviceAssignments.serviceId, services.id))
		.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
		.where(and(eq(serviceAssignments.userId, user.id), isNull(serviceAssignments.revokedAt)))
		.orderBy(asc(services.createdAt));

	return rows.map(
		({ id, name, description, buildingName }) =>
			({ id, name, description, buildingName }) satisfies ServiceSummary
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
		.select(serviceColumns)
		.from(services)
		.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
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
