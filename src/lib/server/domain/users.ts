import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { serviceAssignments, services, sessions, users } from '#lib/server/db/schema';
import type { AssignmentRole, Role } from '#lib/types';
import { recordAudit } from './audit';
import { DomainError } from './errors';
import { getPgErrorCode } from '#lib/server/db/errors';

/**
 * Clave de bloqueo de asesoría que serializa los cambios que pueden afectar al
 * conjunto de administradores activos (primer arranque, activación, cambio de rol).
 */
const ADMIN_GUARD_LOCK = 918273645;

export function normalizeUsername(raw: string): string {
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

export interface ChangeUserRoleInput {
	userId: string;
	role: Role;
	actorId: string;
	confirmRevoke: boolean;
}

export interface ChangeUserRoleResult {
	revokedAssignmentIds: string[];
}

export async function changeUserRole(
	db: Database,
	input: ChangeUserRoleInput
): Promise<ChangeUserRoleResult> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_GUARD_LOCK})`);

		const [target] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
		if (!target) throw new DomainError(404, 'Usuario no encontrado.');
		if (target.role === input.role) return { revokedAssignmentIds: [] };

		if (target.role === 'admin' && target.isActive && input.role !== 'admin') {
			const others = await countActiveAdmins(tx, target.id);
			if (others === 0) {
				throw new DomainError(409, 'No se puede degradar al último administrador activo.');
			}
		}

		const incompatible = await listIncompatibleAssignments(tx, input.userId, input.role);
		if (incompatible.length > 0 && !input.confirmRevoke) {
			throw new DomainError(409, 'Este cambio de rol revoca asignaciones incompatibles.', {
				userId: input.userId,
				role: input.role,
				assignments: incompatible
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
				revokedAssignmentIds: incompatible.map((assignment) => assignment.id)
			}
		});

		return { revokedAssignmentIds: incompatible.map((assignment) => assignment.id) };
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
