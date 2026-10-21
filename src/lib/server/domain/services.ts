import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	catalogItems,
	contractAssignments,
	contracts,
	elements,
	evidenceTargets,
	serviceAssignments,
	services,
	users,
	works
} from '#lib/server/db/schema';
import type { AssignmentRole, ServiceLifecycle, SessionUser } from '#lib/types';
import { recordAudit } from './audit';
import { assertBuildingCatalogItem } from './catalog-scope';
import { DomainError } from './errors';

const visibleBuildingName = sql<
	string | null
>`coalesce(${catalogItems.name}, ${services.buildingNameSnapshot})`;

const visibleContractName = sql<string>`${contracts.name}`;

/** Resuelve y valida un ítem del catálogo de edificios. */
async function resolveBuildingItem(
	db: Database,
	catalogItemId: string
): Promise<{ id: string; name: string }> {
	const [item] = await db
		.select({ id: catalogItems.id, name: catalogItems.name })
		.from(catalogItems)
		.where(eq(catalogItems.id, catalogItemId))
		.limit(1);
	if (!item) throw new DomainError(404, 'Ítem de edificio no encontrado.');
	await assertBuildingCatalogItem(db, item.id);
	return item;
}

export interface ServiceSummary {
	id: string;
	contractId: string;
	contractName: string;
	name: string;
	description: string | null;
	lifecycle: ServiceLifecycle;
	buildingName: string | null;
	buildingCatalogItemId: string | null;
}

export interface CreateServiceInput {
	contractId: string;
	name: string;
	description?: string | null;
	/** Edificio opcional; debe pertenecer a un catálogo de tipo Edificios. */
	buildingCatalogItemId?: string | null;
	/** `planned` permite preparar la estructura sin capturar evidencia. */
	lifecycle?: Extract<ServiceLifecycle, 'planned' | 'active'>;
	actorId: string;
}

export async function createService(
	db: Database,
	input: CreateServiceInput
): Promise<{ id: string; contractId: string }> {
	return db.transaction(async (tx) => {
		const [contract] = await tx
			.select({ id: contracts.id, lifecycle: contracts.lifecycle })
			.from(contracts)
			.where(eq(contracts.id, input.contractId))
			.limit(1);
		if (!contract) throw new DomainError(404, 'Contrato no encontrado.');
		if (contract.lifecycle !== 'active') {
			throw new DomainError(409, 'Activa el contrato antes de añadir servicios.');
		}

		let buildingCatalogItemId: string | null = null;
		let buildingNameSnapshot: string | null = null;
		if (input.buildingCatalogItemId) {
			const building = await resolveBuildingItem(tx, input.buildingCatalogItemId);
			buildingCatalogItemId = building.id;
			buildingNameSnapshot = building.name;
		}

		const lifecycle = input.lifecycle ?? 'active';
		const [created] = await tx
			.insert(services)
			.values({
				contractId: input.contractId,
				name: input.name,
				description: input.description?.trim() || null,
				lifecycle,
				buildingCatalogItemId,
				buildingNameSnapshot,
				createdBy: input.actorId
			})
			.returning({ id: services.id });

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: created.id,
			entityType: 'service',
			entityId: created.id,
			action: 'service.created',
			metadata: {
				name: input.name,
				contractId: input.contractId,
				buildingCatalogItemId,
				lifecycle
			}
		});

		return { id: created.id, contractId: input.contractId };
	});
}

export interface UpdateServiceInput {
	serviceId: string;
	name: string;
	description?: string | null;
	/** `undefined` conserva el edificio actual; `null` lo quita; un id lo vincula. */
	buildingCatalogItemId?: string | null;
	/** `undefined` conserva el contrato; un id lo mueve (revoca asignaciones ajenas al nuevo contrato). */
	contractId?: string;
	actorId: string;
}

/** Edita nombre, descripción, edificio y contrato sin alterar entregas ni revisiones. */
export async function updateService(db: Database, input: UpdateServiceInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [current] = await tx
			.select({ id: services.id, contractId: services.contractId, lifecycle: services.lifecycle })
			.from(services)
			.where(eq(services.id, input.serviceId))
			.limit(1);
		if (!current) throw new DomainError(404, 'Servicio no encontrado.');
		if (current.lifecycle === 'archived') {
			throw new DomainError(409, 'Un servicio archivado es de solo lectura.');
		}

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
				const item = await resolveBuildingItem(tx, input.buildingCatalogItemId);
				values.buildingCatalogItemId = item.id;
				values.buildingNameSnapshot = item.name;
			}
		}

		// Cambio de contrato: validar y revocar asignaciones ajenas al nuevo contrato
		// (los participantes de un servicio deben pertenecer a su contrato).
		if (input.contractId && input.contractId !== current.contractId) {
			const [contract] = await tx
				.select({ id: contracts.id, lifecycle: contracts.lifecycle })
				.from(contracts)
				.where(eq(contracts.id, input.contractId))
				.limit(1);
			if (!contract) throw new DomainError(404, 'Contrato no encontrado.');
			if (contract.lifecycle !== 'active') {
				throw new DomainError(409, 'Solo puedes mover servicios a contratos activos.');
			}

			values.contractId = input.contractId;

			await tx
				.update(serviceAssignments)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(serviceAssignments.serviceId, input.serviceId),
						isNull(serviceAssignments.revokedAt),
						sql`not exists (
							select 1 from ${contractAssignments}
							where ${contractAssignments.contractId} = ${input.contractId}
							and ${contractAssignments.userId} = ${serviceAssignments.userId}
							and ${contractAssignments.assignmentRole} = ${serviceAssignments.assignmentRole}
							and ${contractAssignments.revokedAt} is null
						)`
					)
				);
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

export interface SetServiceLifecycleInput {
	serviceId: string;
	lifecycle: ServiceLifecycle;
	actorId: string;
}

/**
 * Cambia el ciclo de vida del servicio sin alterar evidencias ni aprobaciones.
 * `planned` solo se usa al crear. Un servicio archivado es terminal y, para
 * archivarlo, todo su trabajo debe estar aprobado.
 */
export async function setServiceLifecycle(
	db: Database,
	input: SetServiceLifecycleInput
): Promise<void> {
	await db.transaction(async (tx) => {
		const [current] = await tx
			.select({ id: services.id, lifecycle: services.lifecycle, contractId: services.contractId })
			.from(services)
			.where(eq(services.id, input.serviceId))
			.for('update')
			.limit(1);
		if (!current) throw new DomainError(404, 'Servicio no encontrado.');
		if (current.lifecycle === input.lifecycle) return;

		const [contract] = await tx
			.select({ lifecycle: contracts.lifecycle })
			.from(contracts)
			.where(eq(contracts.id, current.contractId))
			.for('update')
			.limit(1);
		if (!contract) throw new DomainError(404, 'Contrato no encontrado.');

		if (current.lifecycle === 'archived') {
			if (input.lifecycle !== 'inactive') {
				throw new DomainError(409, 'Un servicio archivado solo puede desarchivarse a inactivo.');
			}
			if (contract.lifecycle === 'archived') {
				throw new DomainError(409, 'Desarchiva el contrato antes de desarchivar este servicio.');
			}
		} else {
			if (input.lifecycle === 'planned') {
				throw new DomainError(409, 'Un servicio existente no puede volver a la lista de espera.');
			}
			if (input.lifecycle === 'active' && contract.lifecycle !== 'active') {
				throw new DomainError(409, 'Reactiva el contrato antes de activar este servicio.');
			}
		}

		if (current.lifecycle !== 'archived' && input.lifecycle === 'archived') {
			const workRows = await tx
				.select({ id: works.id, mode: works.mode })
				.from(works)
				.where(eq(works.serviceId, input.serviceId));
			if (workRows.length === 0) {
				throw new DomainError(409, 'El servicio no tiene trabajos y no puede archivarse.');
			}

			const workIds = workRows.map((row) => row.id);
			const elementRows = await tx
				.select({ id: elements.id, workId: elements.workId })
				.from(elements)
				.where(inArray(elements.workId, workIds));
			const elementIds = elementRows.map((row) => row.id);
			const directTargets = await tx
				.select({ workId: evidenceTargets.workId, status: evidenceTargets.currentStatus })
				.from(evidenceTargets)
				.where(inArray(evidenceTargets.workId, workIds));
			const elementTargets = elementIds.length
				? await tx
						.select({
							elementId: evidenceTargets.elementId,
							status: evidenceTargets.currentStatus
						})
						.from(evidenceTargets)
						.where(inArray(evidenceTargets.elementId, elementIds))
				: [];

			const directStatus = new Map(directTargets.map((row) => [row.workId, row.status]));
			const elementStatus = new Map(elementTargets.map((row) => [row.elementId, row.status]));
			const elementsByWork = new Map<string, string[]>();
			for (const row of elementRows) {
				const list = elementsByWork.get(row.workId) ?? [];
				list.push(row.id);
				elementsByWork.set(row.workId, list);
			}

			const completed = workRows.every((work) => {
				if (work.mode === 'direct') return directStatus.get(work.id) === 'approved';
				const ids = elementsByWork.get(work.id) ?? [];
				return ids.length > 0 && ids.every((id) => elementStatus.get(id) === 'approved');
			});
			if (!completed) {
				throw new DomainError(
					409,
					'Solo puedes archivar un servicio cuando todos sus trabajos están aprobados.'
				);
			}
		}

		await tx
			.update(services)
			.set({ lifecycle: input.lifecycle, updatedAt: new Date() })
			.where(eq(services.id, input.serviceId));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: input.serviceId,
			entityType: 'service',
			entityId: input.serviceId,
			action: 'service.lifecycle_changed',
			metadata: { from: current.lifecycle, to: input.lifecycle }
		});
	});
}

const serviceColumns = {
	id: services.id,
	contractId: services.contractId,
	contractName: visibleContractName,
	name: services.name,
	description: services.description,
	lifecycle: services.lifecycle,
	buildingName: visibleBuildingName,
	buildingCatalogItemId: services.buildingCatalogItemId
};

/**
 * Administrador: todos los servicios. Resto: solo los asignados activamente,
 * y siempre que sigan siendo **miembros activos del contrato** del servicio.
 */
export async function listServicesForUser(
	db: Database,
	user: SessionUser
): Promise<ServiceSummary[]> {
	if (user.role === 'admin') {
		return db
			.select(serviceColumns)
			.from(services)
			.innerJoin(contracts, eq(contracts.id, services.contractId))
			.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
			.orderBy(asc(services.createdAt));
	}

	const rows = await db
		.selectDistinct({ ...serviceColumns, sortKey: services.createdAt })
		.from(services)
		.innerJoin(contracts, eq(contracts.id, services.contractId))
		.innerJoin(serviceAssignments, eq(serviceAssignments.serviceId, services.id))
		.innerJoin(
			contractAssignments,
			and(
				eq(contractAssignments.contractId, services.contractId),
				eq(contractAssignments.userId, serviceAssignments.userId),
				eq(contractAssignments.assignmentRole, serviceAssignments.assignmentRole),
				isNull(contractAssignments.revokedAt)
			)
		)
		.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
		.where(and(eq(serviceAssignments.userId, user.id), isNull(serviceAssignments.revokedAt)))
		.orderBy(asc(services.createdAt));

	return rows.map(
		({
			id,
			contractId,
			contractName,
			name,
			description,
			lifecycle,
			buildingName,
			buildingCatalogItemId
		}) =>
			({
				id,
				contractId,
				contractName,
				name,
				description,
				lifecycle,
				buildingName,
				buildingCatalogItemId
			}) satisfies ServiceSummary
	);
}

/** Contrato al que pertenece un servicio. */
export async function getServiceContractId(db: Database, serviceId: string): Promise<string> {
	const [row] = await db
		.select({ contractId: services.contractId })
		.from(services)
		.where(eq(services.id, serviceId))
		.limit(1);
	if (!row) throw new DomainError(404, 'Servicio no encontrado.');
	return row.contractId;
}

/** Servicios de un contrato (para su ficha). */
export async function listServicesByContract(
	db: Database,
	contractId: string
): Promise<ServiceSummary[]> {
	const rows = await db
		.select(serviceColumns)
		.from(services)
		.innerJoin(contracts, eq(contracts.id, services.contractId))
		.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
		.where(eq(services.contractId, contractId))
		.orderBy(asc(services.createdAt));

	return rows.map(
		({
			id,
			contractId: cid,
			contractName,
			name,
			description,
			lifecycle,
			buildingName,
			buildingCatalogItemId
		}) =>
			({
				id,
				contractId: cid,
				contractName,
				name,
				description,
				lifecycle,
				buildingName,
				buildingCatalogItemId
			}) satisfies ServiceSummary
	);
}

/** Ids de servicios visibles para el usuario (`null` = todos, admin). */ export async function listAllowedServiceIds(
	db: Database,
	user: SessionUser
): Promise<string[] | null> {
	if (user.role === 'admin') return null;
	const rows = await db
		.select({ id: services.id })
		.from(services)
		.innerJoin(serviceAssignments, eq(serviceAssignments.serviceId, services.id))
		.innerJoin(
			contractAssignments,
			and(
				eq(contractAssignments.contractId, services.contractId),
				eq(contractAssignments.userId, serviceAssignments.userId),
				eq(contractAssignments.assignmentRole, serviceAssignments.assignmentRole),
				isNull(contractAssignments.revokedAt)
			)
		)
		.where(and(eq(serviceAssignments.userId, user.id), isNull(serviceAssignments.revokedAt)));
	return [...new Set(rows.map((row) => row.id))];
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
		.innerJoin(contracts, eq(contracts.id, services.contractId))
		.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
		.where(eq(services.id, serviceId))
		.limit(1);

	if (!service) throw new DomainError(404, 'Servicio no encontrado.');
	if (user.role === 'admin') return { service, access: 'admin' };

	const [assignment] = await db
		.select({ assignmentRole: serviceAssignments.assignmentRole })
		.from(serviceAssignments)
		.innerJoin(
			contractAssignments,
			and(
				eq(contractAssignments.contractId, service.contractId),
				eq(contractAssignments.userId, serviceAssignments.userId),
				eq(contractAssignments.assignmentRole, serviceAssignments.assignmentRole),
				isNull(contractAssignments.revokedAt)
			)
		)
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
