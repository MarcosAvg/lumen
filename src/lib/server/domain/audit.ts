import { eq } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { auditEvents, users } from '#lib/server/db/schema';

export interface AuditInput {
	actorUserId?: string | null;
	/** Nombre del actor congelado como firma histórica (opcional: se resuelve si falta). */
	actorName?: string | null;
	serviceId?: string | null;
	entityType: string;
	entityId?: string | null;
	action: string;
	metadata?: Record<string, unknown>;
}

/**
 * Registra un evento de auditoría. Debe invocarse dentro de la misma
 * transacción que la mutación para que el rastro sea consistente. Guarda el
 * nombre del actor para conservar la firma aunque el usuario se elimine.
 */
export async function recordAudit(db: Database, input: AuditInput): Promise<void> {
	let actorName = input.actorName ?? null;
	if (!actorName && input.actorUserId) {
		const [actor] = await db
			.select({ name: users.displayName })
			.from(users)
			.where(eq(users.id, input.actorUserId))
			.limit(1);
		actorName = actor?.name ?? null;
	}

	await db.insert(auditEvents).values({
		actorUserId: input.actorUserId ?? null,
		actorName,
		serviceId: input.serviceId ?? null,
		entityType: input.entityType,
		entityId: input.entityId ?? null,
		action: input.action,
		metadata: input.metadata ?? null
	});
}
