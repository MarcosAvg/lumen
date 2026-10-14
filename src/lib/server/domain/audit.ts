import type { Database } from '#lib/server/db';
import { auditEvents } from '#lib/server/db/schema';

export interface AuditInput {
	actorUserId?: string | null;
	serviceId?: string | null;
	entityType: string;
	entityId?: string | null;
	action: string;
	metadata?: Record<string, unknown>;
}

/**
 * Registra un evento de auditoría. Debe invocarse dentro de la misma
 * transacción que la mutación para que el rastro sea consistente.
 */
export async function recordAudit(db: Database, input: AuditInput): Promise<void> {
	await db.insert(auditEvents).values({
		actorUserId: input.actorUserId ?? null,
		serviceId: input.serviceId ?? null,
		entityType: input.entityType,
		entityId: input.entityId ?? null,
		action: input.action,
		metadata: input.metadata ?? null
	});
}
