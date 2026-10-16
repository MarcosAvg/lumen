import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	auditEvents,
	contractAssignments,
	contracts,
	evidenceSubmissions,
	photos,
	reviews,
	serviceAssignments,
	services,
	sessions,
	users
} from '#lib/server/db/schema';
import type { AssignmentRole, Role } from '#lib/types';
import { recordAudit } from './audit';
import { DomainError } from './errors';
import { getPgErrorCode } from '#lib/server/db/errors';

/**
 * Clave de bloqueo de asesoría que serializa los cambios que pueden afectar al
 * conjunto de administradores activos (primer arranque, activación, cambio de rol).
 */
const ADMIN_GUARD_LOCK = 918273645;

function normalizeUsername(raw: string): string {
	return raw.trim().toLowerCase();
}

/** `true` mientras no exista ningún administrador (gate del asistente de primer arranque). */
export async function isSetupRequired(db: Database): Promise<boolean> {
	try {
		const admins = await db.$count(users, eq(users.role, 'admin'));
		return admins === 0;
	} catch (error) {
		// La tabla `users` aún no existe: hay que aplicar migraciones y configurar.
		if (getPgErrorCode(error) === '42P01') return true;
		throw error;
	}
}

export async function countActiveAdmins(db: Database, excludeUserId?: string): Promise<number> {
	const conditions = [eq(users.role, 'admin'), eq(users.isActive, true)];
	if (excludeUserId) conditions.push(ne(users.id, excludeUserId));
	return db.$count(users, and(...conditions));
}

export interface CreateFirstAdminInput {
	username: string;
	displayName: string;
	passwordHash: string;
}

/**
 * Crea la primera cuenta administradora de forma atómica. Dos solicitudes
 * simultáneas se serializan con un bloqueo de asesoría: solo una gana.
 */
export async function createFirstAdmin(
	db: Database,
	input: CreateFirstAdminInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_GUARD_LOCK})`);

		const admins = await tx.$count(users, eq(users.role, 'admin'));
		if (admins > 0) throw new DomainError(409, 'Lumen ya fue configurado.');

		const [created] = await tx
			.insert(users)
			.values({
				username: normalizeUsername(input.username),
				displayName: input.displayName,
				passwordHash: input.passwordHash,
				role: 'admin',
				isActive: true
			})
			.returning({ id: users.id });

		await recordAudit(tx, {
			actorUserId: created.id,
			entityType: 'user',
			entityId: created.id,
			action: 'user.first_admin_created',
			metadata: { role: 'admin' }
		});

		return { id: created.id };
	});
}

export interface CreateUserInput {
	username: string;
	displayName: string;
	passwordHash: string;
	role: Role;
	actorId: string;
}

export async function createUser(db: Database, input: CreateUserInput): Promise<{ id: string }> {
	const username = normalizeUsername(input.username);
	try {
		return await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(users)
				.values({
					username,
					displayName: input.displayName,
					passwordHash: input.passwordHash,
					role: input.role,
					isActive: true
				})
				.returning({ id: users.id });

			await recordAudit(tx, {
				actorUserId: input.actorId,
				entityType: 'user',
				entityId: created.id,
				action: 'user.created',
				metadata: { role: input.role, username }
			});

			return { id: created.id };
		});
	} catch (error) {
		if (getPgErrorCode(error) === '23505') {
			throw new DomainError(409, 'Ese nombre de usuario ya existe.');
		}
		throw error;
	}
}

export interface SetUserActiveInput {
	userId: string;
	active: boolean;
	actorId: string;
}

export async function setUserActive(db: Database, input: SetUserActiveInput): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_GUARD_LOCK})`);

		const [target] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
		if (!target) throw new DomainError(404, 'Usuario no encontrado.');

		if (!input.active && target.isActive && target.role === 'admin') {
			const others = await countActiveAdmins(tx, target.id);
			if (others === 0) {
				throw new DomainError(409, 'No se puede desactivar al último administrador activo.');
			}
		}

		if (target.isActive === input.active) return;

		await tx
			.update(users)
			.set({
				isActive: input.active,
				disabledAt: input.active ? null : new Date(),
				updatedAt: new Date()
			})
			.where(eq(users.id, input.userId));

		if (!input.active) {
			await tx
				.update(sessions)
				.set({ revokedAt: new Date() })
				.where(and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt)));
		}

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'user',
			entityId: input.userId,
			action: input.active ? 'user.activated' : 'user.deactivated'
		});
	});
}

export interface IncompatibleAssignment {
	id: string;
	serviceId: string;
	serviceName: string;
	assignmentRole: AssignmentRole;
}

export interface IncompatibleContractAssignment {
	id: string;
	contractId: string;
	contractName: string;
	assignmentRole: AssignmentRole;
}

/**
 * Asignaciones activas incompatibles con el nuevo rol global. Un usuario
 * `technician` solo admite asignaciones de técnico; `supervisor`, de supervisor;
 * un administrador no requiere asignaciones y todas quedan incompatibles.
 */
export async function listIncompatibleAssignments(
	db: Database,
	userId: string,
	newRole: Role
): Promise<IncompatibleAssignment[]> {
	const rows = await db
		.select({
			id: serviceAssignments.id,
			serviceId: serviceAssignments.serviceId,
			serviceName: services.name,
			assignmentRole: serviceAssignments.assignmentRole
		})
		.from(serviceAssignments)
		.innerJoin(services, eq(services.id, serviceAssignments.serviceId))
		.where(and(eq(serviceAssignments.userId, userId), isNull(serviceAssignments.revokedAt)));

	return rows.filter((row) => row.assignmentRole !== newRole);
}

/** Asignaciones de contrato activas incompatibles con el nuevo rol global. */
async function listIncompatibleContractAssignments(
	db: Database,
	userId: string,
	newRole: Role
): Promise<IncompatibleContractAssignment[]> {
	const rows = await db
		.select({
			id: contractAssignments.id,
			contractId: contractAssignments.contractId,
			contractName: contracts.name,
			assignmentRole: contractAssignments.assignmentRole
		})
		.from(contractAssignments)
		.innerJoin(contracts, eq(contracts.id, contractAssignments.contractId))
		.where(and(eq(contractAssignments.userId, userId), isNull(contractAssignments.revokedAt)));

	return rows.filter((row) => row.assignmentRole !== newRole);
}

export interface ChangeUserRoleInput {
	userId: string;
	role: Role;
	actorId: string;
	confirmRevoke: boolean;
}

export interface ChangeUserRoleResult {
	revokedAssignmentIds: string[];
	revokedContractAssignmentIds: string[];
}

export async function changeUserRole(
	db: Database,
	input: ChangeUserRoleInput
): Promise<ChangeUserRoleResult> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_GUARD_LOCK})`);

		const [target] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
		if (!target) throw new DomainError(404, 'Usuario no encontrado.');
		if (target.role === input.role)
			return { revokedAssignmentIds: [], revokedContractAssignmentIds: [] };

		if (target.role === 'admin' && target.isActive && input.role !== 'admin') {
			const others = await countActiveAdmins(tx, target.id);
			if (others === 0) {
				throw new DomainError(409, 'No se puede degradar al último administrador activo.');
			}
		}

		const incompatible = await listIncompatibleAssignments(tx, input.userId, input.role);
		const incompatibleContracts = await listIncompatibleContractAssignments(
			tx,
			input.userId,
			input.role
		);
		if ((incompatible.length > 0 || incompatibleContracts.length > 0) && !input.confirmRevoke) {
			throw new DomainError(409, 'Este cambio de rol revoca asignaciones incompatibles.', {
				userId: input.userId,
				role: input.role,
				assignments: incompatible,
				contracts: incompatibleContracts
			});
		}

		if (incompatible.length > 0) {
			await tx
				.update(serviceAssignments)
				.set({ revokedAt: new Date() })
				.where(
					inArray(
						serviceAssignments.id,
						incompatible.map((assignment) => assignment.id)
					)
				);
		}
		if (incompatibleContracts.length > 0) {
			await tx
				.update(contractAssignments)
				.set({ revokedAt: new Date() })
				.where(
					inArray(
						contractAssignments.id,
						incompatibleContracts.map((assignment) => assignment.id)
					)
				);
		}

		await tx
			.update(users)
			.set({ role: input.role, updatedAt: new Date() })
			.where(eq(users.id, input.userId));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'user',
			entityId: input.userId,
			action: 'user.role_changed',
			metadata: {
				from: target.role,
				to: input.role,
				revokedAssignmentIds: incompatible.map((assignment) => assignment.id),
				revokedContractAssignmentIds: incompatibleContracts.map((assignment) => assignment.id)
			}
		});

		return {
			revokedAssignmentIds: incompatible.map((assignment) => assignment.id),
			revokedContractAssignmentIds: incompatibleContracts.map((assignment) => assignment.id)
		};
	});
}

export interface SetUserPasswordInput {
	userId: string;
	passwordHash: string;
	actorId: string;
}

export async function setUserPassword(db: Database, input: SetUserPasswordInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [target] = await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, input.userId))
			.limit(1);
		if (!target) throw new DomainError(404, 'Usuario no encontrado.');

		await tx
			.update(users)
			.set({ passwordHash: input.passwordHash, updatedAt: new Date() })
			.where(eq(users.id, input.userId));

		await tx
			.update(sessions)
			.set({ revokedAt: new Date() })
			.where(and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt)));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'user',
			entityId: input.userId,
			action: 'user.password_reset'
		});
	});
}

export interface UpdateUserProfileInput {
	userId: string;
	username: string;
	displayName: string;
	actorId: string;
}

/**
 * Edita el nombre visible y el nombre de usuario. **No** modifica las firmas
 * históricas congeladas: el historial conserva el nombre de cuando se actuó.
 */
export async function updateUserProfile(
	db: Database,
	input: UpdateUserProfileInput
): Promise<void> {
	const username = normalizeUsername(input.username);
	const displayName = input.displayName.trim();

	try {
		await db.transaction(async (tx) => {
			const [target] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
			if (!target) throw new DomainError(404, 'Usuario no encontrado.');
			if (target.username === username && target.displayName === displayName) return;

			await tx
				.update(users)
				.set({ username, displayName, updatedAt: new Date() })
				.where(eq(users.id, input.userId));

			await recordAudit(tx, {
				actorUserId: input.actorId,
				entityType: 'user',
				entityId: input.userId,
				action: 'user.updated',
				metadata: {
					before: { username: target.username, displayName: target.displayName },
					after: { username, displayName }
				}
			});
		});
	} catch (error) {
		if (getPgErrorCode(error) === '23505') {
			throw new DomainError(409, 'Ese nombre de usuario ya existe.');
		}
		throw error;
	}
}

export interface UserListItem {
	id: string;
	username: string;
	displayName: string;
	role: Role;
	isActive: boolean;
	createdAt: Date;
}

export async function listUsers(db: Database): Promise<UserListItem[]> {
	return db
		.select({
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			role: users.role,
			isActive: users.isActive,
			createdAt: users.createdAt
		})
		.from(users)
		.orderBy(asc(users.createdAt));
}

export interface LoginCandidate {
	id: string;
	username: string;
	displayName: string;
	role: Role;
	passwordHash: string;
	isActive: boolean;
}

export async function findUserForLogin(
	db: Database,
	username: string
): Promise<LoginCandidate | null> {
	const [row] = await db
		.select({
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			role: users.role,
			passwordHash: users.passwordHash,
			isActive: users.isActive
		})
		.from(users)
		.where(sql`lower(${users.username}) = ${normalizeUsername(username)}`)
		.limit(1);
	return row ?? null;
}

export interface UserImpact {
	submissions: number;
	reviews: number;
	photos: number;
	auditEvents: number;
	assignments: number;
}

/** Recuento de lo que un usuario ha dejado en el sistema (para el resumen de borrado). */
export async function getUserImpact(db: Database, userId: string): Promise<UserImpact> {
	const [submissions, reviewsCount, photosCount, auditCount, assignments] = await Promise.all([
		db.$count(evidenceSubmissions, eq(evidenceSubmissions.submittedBy, userId)),
		db.$count(reviews, eq(reviews.reviewerId, userId)),
		db.$count(photos, or(eq(photos.uploadedBy, userId), eq(photos.removedBy, userId))),
		db.$count(auditEvents, eq(auditEvents.actorUserId, userId)),
		db.$count(serviceAssignments, eq(serviceAssignments.userId, userId))
	]);
	return {
		submissions,
		reviews: reviewsCount,
		photos: photosCount,
		auditEvents: auditCount,
		assignments
	};
}

export interface DeleteUserInput {
	userId: string;
	actorId: string;
}

/**
 * Elimina físicamente una cuenta. Su **firma histórica** se conserva gracias a
 * los nombres congelados en entregas, revisiones, fotos y auditoría. Protegido
 * contra eliminar al último administrador activo.
 */
export async function deleteUser(db: Database, input: DeleteUserInput): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_GUARD_LOCK})`);

		const [target] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
		if (!target) throw new DomainError(404, 'Usuario no encontrado.');

		if (target.role === 'admin' && target.isActive) {
			const others = await countActiveAdmins(tx, target.id);
			if (others === 0) {
				throw new DomainError(409, 'No se puede eliminar al último administrador activo.');
			}
		}

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'user',
			entityId: target.id,
			action: 'user.deleted',
			metadata: { username: target.username, role: target.role }
		});

		// Las cascadas eliminan sesiones, asignaciones, notificaciones y
		// suscripciones; las FK de autoría quedan NULL pero el nombre persiste.
		await tx.delete(users).where(eq(users.id, target.id));
	});
}
