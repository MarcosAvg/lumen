import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { sessions, users } from '#lib/server/db/schema';
import type { SessionUser } from '#lib/types';

export interface NewSession {
	userId: string;
	tokenHash: string;
	expiresAt: Date;
	userAgent?: string | null;
	ip?: string | null;
}

export async function insertSession(db: Database, session: NewSession): Promise<void> {
	await db.insert(sessions).values({
		userId: session.userId,
		tokenHash: session.tokenHash,
		expiresAt: session.expiresAt,
		userAgent: session.userAgent ?? null,
		ip: session.ip ?? null
	});
}

/**
 * Resuelve la sesión a partir del hash del token. Devuelve `null` si no existe,
 * fue revocada, expiró o si el usuario ya no está activo (desactivación inmediata).
 */
export async function findActiveSession(
	db: Database,
	tokenHash: string
): Promise<SessionUser | null> {
	const rows = await db
		.select({
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			role: users.role
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(
			and(
				eq(sessions.tokenHash, tokenHash),
				isNull(sessions.revokedAt),
				gt(sessions.expiresAt, new Date()),
				eq(users.isActive, true)
			)
		)
		.limit(1);

	return rows[0] ?? null;
}

export async function revokeSession(db: Database, tokenHash: string): Promise<void> {
	await db
		.update(sessions)
		.set({ revokedAt: new Date() })
		.where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
}

export async function revokeSessionsForUser(db: Database, userId: string): Promise<void> {
	await db
		.update(sessions)
		.set({ revokedAt: new Date() })
		.where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
