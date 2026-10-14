import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { notifications, serviceAssignments, users } from '#lib/server/db/schema';

/**
 * Notificaciones internas (docs/03 §8): se crean **dentro de la transacción**
 * de envío/revisión, con clave de evento idempotente por destinatario. El push
 * es posterior al commit y best-effort.
 */

export type NotificationEventType =
	'submission.submitted' | 'submission.approved' | 'submission.rejected';

/**
 * Usuarios **activos** con asignación **vigente** del rol indicado en el servicio.
 * Base del ámbito de notificaciones: desactivar o desasignar excluye del evento.
 */
export async function resolveServiceRecipients(
	db: Database,
	serviceId: string,
	role: 'supervisor' | 'technician'
): Promise<string[]> {
	const rows = await db
		.select({ userId: serviceAssignments.userId })
		.from(serviceAssignments)
		.innerJoin(users, eq(users.id, serviceAssignments.userId))
		.where(
			and(
				eq(serviceAssignments.serviceId, serviceId),
				eq(serviceAssignments.assignmentRole, role),
				isNull(serviceAssignments.revokedAt),
				eq(users.isActive, true)
			)
		);
	return [...new Set(rows.map((row) => row.userId))];
}

export interface NotificationInput {
	recipientUserId: string;
	serviceId: string | null;
	targetId: string | null;
	submissionId: string | null;
	reviewId: string | null;
	eventType: NotificationEventType;
	title: string;
	body: string;
	deepLink: string;
	eventKey: string;
}

/** Inserta notificaciones idempotentes (`ON CONFLICT (recipient,event_key)`). */
export async function insertNotifications(db: Database, items: NotificationInput[]): Promise<void> {
	if (items.length === 0) return;
	await db
		.insert(notifications)
		.values(items)
		.onConflictDoNothing({
			target: [notifications.recipientUserId, notifications.eventKey]
		});
}

export interface OutboundNotification {
	recipientIds: string[];
	message: { title: string; body: string; url: string; tag: string };
}

/** Notificaciones de una entrega para los supervisores asignados (no admins). */
export async function createSubmissionNotifications(
	db: Database,
	context: {
		serviceId: string;
		targetId: string;
		submissionId: string;
		sequenceNo: number;
		serviceName: string;
		workName: string;
		label: string;
	}
): Promise<OutboundNotification> {
	const recipientIds = await resolveServiceRecipients(db, context.serviceId, 'supervisor');
	const title = `Nueva entrega #${context.sequenceNo}`;
	const body = describeTarget(context);
	const deepLink = `/submissions/${context.submissionId}`;
	const eventKey = `submission:${context.submissionId}:submitted`;

	await insertNotifications(
		db,
		recipientIds.map((recipientUserId) => ({
			recipientUserId,
			serviceId: context.serviceId,
			targetId: context.targetId,
			submissionId: context.submissionId,
			reviewId: null,
			eventType: 'submission.submitted',
			title,
			body,
			deepLink,
			eventKey
		}))
	);

	return {
		recipientIds,
		message: { title, body, url: deepLink, tag: eventKey }
	};
}

/** Notificaciones de una decisión para todos los técnicos asignados activos. */
export async function createReviewNotifications(
	db: Database,
	context: {
		serviceId: string;
		targetId: string;
		submissionId: string;
		reviewId: string;
		decision: 'approved' | 'rejected';
		serviceName: string;
		workName: string;
		label: string;
		targetDeepLink: string;
	}
): Promise<OutboundNotification> {
	const recipientIds = await resolveServiceRecipients(db, context.serviceId, 'technician');
	const approved = context.decision === 'approved';
	const title = approved ? 'Entrega aprobada' : 'Entrega rechazada';
	const body = describeTarget(context);
	const eventKey = `submission:${context.submissionId}:reviewed`;

	await insertNotifications(
		db,
		recipientIds.map((recipientUserId) => ({
			recipientUserId,
			serviceId: context.serviceId,
			targetId: context.targetId,
			submissionId: context.submissionId,
			reviewId: context.reviewId,
			eventType: approved ? 'submission.approved' : 'submission.rejected',
			title,
			body,
			deepLink: context.targetDeepLink,
			eventKey
		}))
	);

	return {
		recipientIds,
		message: { title, body, url: context.targetDeepLink, tag: eventKey }
	};
}

function describeTarget(context: { serviceName: string; workName: string; label: string }): string {
	const parts = [context.serviceName, context.workName];
	if (context.label && context.label !== context.workName) parts.push(context.label);
	return parts.join(' · ');
}

export interface NotificationView {
	id: string;
	eventType: NotificationEventType;
	title: string;
	body: string;
	deepLink: string;
	createdAt: Date;
	readAt: Date | null;
}

export async function listNotifications(
	db: Database,
	userId: string,
	options: { limit?: number; offset?: number } = {}
): Promise<NotificationView[]> {
	const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
	const offset = Math.max(options.offset ?? 0, 0);
	const rows = await db
		.select({
			id: notifications.id,
			eventType: notifications.eventType,
			title: notifications.title,
			body: notifications.body,
			deepLink: notifications.deepLink,
			createdAt: notifications.createdAt,
			readAt: notifications.readAt
		})
		.from(notifications)
		.where(eq(notifications.recipientUserId, userId))
		.orderBy(desc(notifications.createdAt))
		.limit(limit)
		.offset(offset);

	return rows.map((row) => ({ ...row, eventType: row.eventType as NotificationEventType }));
}

export async function countNotifications(db: Database, userId: string): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`cast(count(*) as int)` })
		.from(notifications)
		.where(eq(notifications.recipientUserId, userId));
	return row?.value ?? 0;
}

export async function unreadNotificationCount(db: Database, userId: string): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`cast(count(*) as int)` })
		.from(notifications)
		.where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)));
	return row?.value ?? 0;
}

/** Marca una notificación propia como leída; devuelve `false` si no aplica. */
export async function markNotificationRead(
	db: Database,
	userId: string,
	notificationId: string
): Promise<boolean> {
	const updated = await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notifications.id, notificationId),
				eq(notifications.recipientUserId, userId),
				isNull(notifications.readAt)
			)
		)
		.returning({ id: notifications.id });
	return updated.length > 0;
}

/** Marca todas las notificaciones propias como leídas. */
export async function markAllNotificationsRead(db: Database, userId: string): Promise<number> {
	const updated = await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)))
		.returning({ id: notifications.id });
	return updated.length;
}

/** Recuento de notificaciones ligadas a un conjunto de objetivos (impacto de borrado). */
export async function countNotificationsForTargets(
	db: Database,
	targetIds: string[]
): Promise<number> {
	if (targetIds.length === 0) return 0;
	const [row] = await db
		.select({ value: sql<number>`cast(count(*) as int)` })
		.from(notifications)
		.where(inArray(notifications.targetId, targetIds));
	return row?.value ?? 0;
}
