import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	contractAssignments,
	contracts,
	serviceAssignments,
	services,
	users
} from '#lib/server/db/schema';
import type { AssignmentRole, SessionUser } from '#lib/types';
import { recordAudit } from './audit';
import { DomainError } from './errors';

/**
 * Contratos: nivel superior que agrupa servicios. Sus participantes definen
 * **quién puede ser asignado** a los servicios del contrato y **quién gestiona**
 * sus asignaciones (supervisores). El ámbito se resuelve aquí y en
 * `services.ts`; fuera del contrato todo es `404` opaco.
 */

export interface ContractSummary {
	id: string;
	name: string;
	description: string | null;
	serviceCount: number;
}

const serviceCountExpr = sql<number>`(select cast(count(*) as int) from ${services} where ${services.contractId} = ${contracts.id})`;

export async function listContractsForUser(
	db: Database,
	user: SessionUser
): Promise<ContractSummary[]> {
	const columns = {
		id: contracts.id,
		name: contracts.name,
		description: contracts.description,
		serviceCount: serviceCountExpr
	};

	if (user.role === 'admin') {
		return db.select(columns).from(contracts).orderBy(asc(contracts.name));
	}

	return db
		.select(columns)
		.from(contracts)
		.innerJoin(
			contractAssignments,
			and(
				eq(contractAssignments.contractId, contracts.id),
				eq(contractAssignments.userId, user.id),
				isNull(contractAssignments.revokedAt)
			)
		)
		.groupBy(contracts.id)
		.orderBy(asc(contracts.name));
}

export interface ContractAccess {
	contract: ContractSummary;
	/** Rol efectivo: admin global, o roles dentro del contrato. */
	isAdmin: boolean;
	isSupervisor: boolean;
	isTechnician: boolean;
	/** Puede asignar/revocar servicios del contrato. */
	canManage: boolean;
}

/** Acceso a un contrato; fuera de ámbito responde `404` opaco. */
export async function getContractAccess(
	db: Database,
	user: SessionUser,
	contractId: string
): Promise<ContractAccess> {
	const [contract] = await db
		.select({
			id: contracts.id,
			name: contracts.name,
			description: contracts.description,
			serviceCount: serviceCountExpr
		})
		.from(contracts)
		.where(eq(contracts.id, contractId))
		.limit(1);
	if (!contract) throw new DomainError(404, 'Contrato no encontrado.');

	if (user.role === 'admin') {
		return { contract, isAdmin: true, isSupervisor: true, isTechnician: true, canManage: true };
	}

	const rows = await db
		.select({ assignmentRole: contractAssignments.assignmentRole })
		.from(contractAssignments)
		.where(
			and(
				eq(contractAssignments.contractId, contractId),
				eq(contractAssignments.userId, user.id),
				isNull(contractAssignments.revokedAt)
			)
		);
	if (rows.length === 0) throw new DomainError(404, 'Contrato no encontrado.');

	const isSupervisor = rows.some((row) => row.assignmentRole === 'supervisor');
	const isTechnician = rows.some((row) => row.assignmentRole === 'technician');
	return { contract, isAdmin: false, isSupervisor, isTechnician, canManage: isSupervisor };
}

/** Contratos activos de un usuario (ids). `null` = todos (admin). */
export async function visibleContractIds(
	db: Database,
	user: SessionUser
): Promise<string[] | null> {
	if (user.role === 'admin') return null;
	const rows = await db
		.select({ contractId: contractAssignments.contractId })
		.from(contractAssignments)
		.where(and(eq(contractAssignments.userId, user.id), isNull(contractAssignments.revokedAt)));
	return [...new Set(rows.map((row) => row.contractId))];
}

/** Márgenes del PDF del contrato, en milímetros. */
export interface ContractPdfMargins {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

/** Contexto de PDF de un contrato: nombre, fondo (ruta) y márgenes (mm). */
export async function getContractPdfContext(
	db: Database,
	contractId: string
): Promise<{ name: string; backgroundPath: string | null; margins: ContractPdfMargins }> {
	const [row] = await db
		.select({
			name: contracts.name,
			backgroundPath: contracts.pdfBackgroundPath,
			marginTop: contracts.pdfMarginTop,
			marginBottom: contracts.pdfMarginBottom,
			marginLeft: contracts.pdfMarginLeft,
			marginRight: contracts.pdfMarginRight
		})
		.from(contracts)
		.where(eq(contracts.id, contractId))
		.limit(1);
	if (!row) throw new DomainError(404, 'Contrato no encontrado.');
	return {
		name: row.name,
		backgroundPath: row.backgroundPath ?? null,
		margins: {
			top: row.marginTop,
			bottom: row.marginBottom,
			left: row.marginLeft,
			right: row.marginRight
		}
	};
}

/** Actualiza los márgenes (mm) del PDF del contrato. */
export async function updateContractPdfMargins(
	db: Database,
	input: { contractId: string; margins: ContractPdfMargins; actorId: string }
): Promise<void> {
	await db.transaction(async (tx) => {
		const [row] = await tx
			.select({ id: contracts.id })
			.from(contracts)
			.where(eq(contracts.id, input.contractId))
			.limit(1);
		if (!row) throw new DomainError(404, 'Contrato no encontrado.');

		await tx
			.update(contracts)
			.set({
				pdfMarginTop: input.margins.top,
				pdfMarginBottom: input.margins.bottom,
				pdfMarginLeft: input.margins.left,
				pdfMarginRight: input.margins.right,
				updatedAt: new Date()
			})
			.where(eq(contracts.id, input.contractId));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'contract',
			entityId: input.contractId,
			action: 'contract.pdf_margins_updated',
			metadata: { ...input.margins }
		});
	});
}

/** Fija (`relPath`) o quita (`null`) el fondo de PDF del contrato. */
export async function setContractPdfBackground(
	db: Database,
	input: { contractId: string; relPath: string | null; actorId: string }
): Promise<void> {
	await db.transaction(async (tx) => {
		const [row] = await tx
			.select({ id: contracts.id, previous: contracts.pdfBackgroundPath })
			.from(contracts)
			.where(eq(contracts.id, input.contractId))
			.limit(1);
		if (!row) throw new DomainError(404, 'Contrato no encontrado.');

		await tx
			.update(contracts)
			.set({ pdfBackgroundPath: input.relPath, updatedAt: new Date() })
			.where(eq(contracts.id, input.contractId));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'contract',
			entityId: input.contractId,
			action: input.relPath ? 'contract.background_set' : 'contract.background_removed',
			metadata: { previous: row.previous }
		});
	});
}

export interface ContractAssignmentItem {
	id: string;
	userId: string;
	displayName: string;
	username: string;
	assignmentRole: AssignmentRole;
	assignedAt: Date;
}

export async function listContractAssignments(
	db: Database,
	contractId: string
): Promise<ContractAssignmentItem[]> {
	return db
		.select({
			id: contractAssignments.id,
			userId: users.id,
			displayName: users.displayName,
			username: users.username,
			assignmentRole: contractAssignments.assignmentRole,
			assignedAt: contractAssignments.assignedAt
		})
		.from(contractAssignments)
		.innerJoin(users, eq(users.id, contractAssignments.userId))
		.where(
			and(eq(contractAssignments.contractId, contractId), isNull(contractAssignments.revokedAt))
		)
		.orderBy(asc(users.displayName));
}

export interface ContractMember {
	id: string;
	username: string;
	displayName: string;
	role: AssignmentRole;
}

/** Miembros activos del contrato (técnicos y supervisores) para asignar servicios. */
export async function listContractMembers(
	db: Database,
	contractId: string
): Promise<ContractMember[]> {
	return db
		.select({
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			role: contractAssignments.assignmentRole
		})
		.from(contractAssignments)
		.innerJoin(users, eq(users.id, contractAssignments.userId))
		.where(
			and(
				eq(contractAssignments.contractId, contractId),
				isNull(contractAssignments.revokedAt),
				eq(users.isActive, true)
			)
		)
		.orderBy(asc(users.displayName));
}

/** ¿El usuario es miembro activo del contrato (en el rol dado)? */
export async function isContractMember(
	db: Database,
	contractId: string,
	userId: string,
	role?: AssignmentRole
): Promise<boolean> {
	const [row] = await db
		.select({ id: contractAssignments.id })
		.from(contractAssignments)
		.where(
			and(
				eq(contractAssignments.contractId, contractId),
				eq(contractAssignments.userId, userId),
				isNull(contractAssignments.revokedAt),
				role ? eq(contractAssignments.assignmentRole, role) : undefined
			)
		)
		.limit(1);
	return Boolean(row);
}

export interface CreateContractInput {
	name: string;
	description?: string | null;
	actorId: string;
}

export async function createContract(
	db: Database,
	input: CreateContractInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const [created] = await tx
			.insert(contracts)
			.values({
				name: input.name,
				description: input.description?.trim() || null,
				createdBy: input.actorId
			})
			.returning({ id: contracts.id });

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'contract',
			entityId: created.id,
			action: 'contract.created',
			metadata: { name: input.name }
		});

		return { id: created.id };
	});
}

export interface UpdateContractInput {
	contractId: string;
	name: string;
	description?: string | null;
	actorId: string;
}

export async function updateContract(db: Database, input: UpdateContractInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [current] = await tx
			.select({ id: contracts.id })
			.from(contracts)
			.where(eq(contracts.id, input.contractId))
			.limit(1);
		if (!current) throw new DomainError(404, 'Contrato no encontrado.');

		await tx
			.update(contracts)
			.set({
				name: input.name,
				description: input.description?.trim() || null,
				updatedAt: new Date()
			})
			.where(eq(contracts.id, input.contractId));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'contract',
			entityId: input.contractId,
			action: 'contract.updated',
			metadata: { name: input.name }
		});
	});
}

/** Elimina un contrato solo si no tiene servicios (evita pérdidas silenciosas). */
export async function deleteContract(
	db: Database,
	input: { contractId: string; actorId: string }
): Promise<void> {
	await db.transaction(async (tx) => {
		const [row] = await tx
			.select({ id: contracts.id, name: contracts.name })
			.from(contracts)
			.where(eq(contracts.id, input.contractId))
			.limit(1);
		if (!row) throw new DomainError(404, 'Contrato no encontrado.');

		const [{ value: serviceCount }] = await tx
			.select({ value: sql<number>`cast(count(*) as int)` })
			.from(services)
			.where(eq(services.contractId, input.contractId));
		if (serviceCount > 0) {
			throw new DomainError(
				409,
				'Este contrato tiene servicios. Muévelos a otro contrato o elimínalos antes de borrarlo.'
			);
		}

		await tx.delete(contracts).where(eq(contracts.id, input.contractId));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'contract',
			entityId: input.contractId,
			action: 'contract.deleted',
			metadata: { name: row.name }
		});
	});
}

export interface AssignContractUserInput {
	contractId: string;
	userId: string;
	role: AssignmentRole;
	actorId: string;
}

export async function assignContractUser(
	db: Database,
	input: AssignContractUserInput
): Promise<{ id: string; created: boolean }> {
	return db.transaction(async (tx) => {
		const [contract] = await tx
			.select({ id: contracts.id })
			.from(contracts)
			.where(eq(contracts.id, input.contractId))
			.limit(1);
		if (!contract) throw new DomainError(404, 'Contrato no encontrado.');

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

		const [existing] = await tx
			.select({ id: contractAssignments.id })
			.from(contractAssignments)
			.where(
				and(
					eq(contractAssignments.contractId, input.contractId),
					eq(contractAssignments.userId, input.userId),
					eq(contractAssignments.assignmentRole, input.role),
					isNull(contractAssignments.revokedAt)
				)
			)
			.limit(1);
		if (existing) return { id: existing.id, created: false };

		const [created] = await tx
			.insert(contractAssignments)
			.values({
				contractId: input.contractId,
				userId: input.userId,
				assignmentRole: input.role,
				assignedBy: input.actorId
			})
			.returning({ id: contractAssignments.id });

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'contract_assignment',
			entityId: created.id,
			action: 'contract_assignment.created',
			metadata: { contractId: input.contractId, userId: input.userId, role: input.role }
		});

		return { id: created.id, created: true };
	});
}

/**
 * Revoca una asignación de contrato y, en cascada, las asignaciones de servicio
 * de ese usuario dentro del contrato (deja de ver sus servicios).
 */
export async function revokeContractAssignment(
	db: Database,
	input: { assignmentId: string; actorId: string }
): Promise<{ contractId: string; revokedServiceAssignments: number }> {
	return db.transaction(async (tx) => {
		const [assignment] = await tx
			.select()
			.from(contractAssignments)
			.where(eq(contractAssignments.id, input.assignmentId))
			.limit(1);
		if (!assignment) throw new DomainError(404, 'Asignación no encontrada.');
		if (assignment.revokedAt) {
			return { contractId: assignment.contractId, revokedServiceAssignments: 0 };
		}

		await tx
			.update(contractAssignments)
			.set({ revokedAt: new Date() })
			.where(eq(contractAssignments.id, input.assignmentId));

		const revoked = await tx
			.update(serviceAssignments)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(serviceAssignments.userId, assignment.userId),
					isNull(serviceAssignments.revokedAt),
					sql`${serviceAssignments.serviceId} in (select ${services.id} from ${services} where ${services.contractId} = ${assignment.contractId})`
				)
			)
			.returning({ id: serviceAssignments.id });

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'contract_assignment',
			entityId: input.assignmentId,
			action: 'contract_assignment.revoked',
			metadata: {
				contractId: assignment.contractId,
				userId: assignment.userId,
				role: assignment.assignmentRole,
				revokedServiceAssignments: revoked.length
			}
		});

		return { contractId: assignment.contractId, revokedServiceAssignments: revoked.length };
	});
}
