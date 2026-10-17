import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	contractAssignments,
	notifications,
	serviceAssignments,
	services,
	users
} from '#lib/server/db/schema';
import {
	submissionReviewedMessage,
	submissionSubmittedMessage,
	type PushMessage
} from './push-messages';

/**
 * Notificaciones internas (docs/referencia/modelo-datos.md): se crean **dentro de la transacción**
 * de envío/revisión, con clave de evento idempotente por destinatario. El push
 * es posterior al commit y best-effort.
 */

export type NotificationEventType =
	'submission.submitted' | 'submission.approved' | 'submission.rejected';

/**
 * Usuarios **activos** con asignación **vigente** del rol indicado en el
 * servicio y **miembros del contrato** de ese servicio. Desactivar, desasignar
 * o salir del contrato excluye del evento.
 */
export async function resolveServiceRecipients(
	db: Database,
	serviceId: string,
	role: 'supervisor' | 'technician'
): Promise<string[]> {
	const rows = await db
		.select({ userId: serviceAssignments.userId })
		.from(serviceAssignments)
		.innerJoin(services, eq(services.id, serviceAssignments.serviceId))
		.innerJoin(
			contractAssignments,
			and(
				eq(contractAssignments.contractId, services.contractId),
				eq(contractAssignments.userId, serviceAssignments.userId),
				eq(contractAssignments.assignmentRole, serviceAssignments.assignmentRole),
				isNull(contractAssignments.revokedAt)
			)
		)
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

/**
 * Administradores **activos** (ámbito global). Se excluye al actor para no
 * notificarle su propia acción.
 */
export async function resolveAdminRecipients(
	db: Database,
	excludeUserId?: string
): Promise<string[]> {
	const rows = await db
		.select({ userId: users.id })
		.from(users)
		.where(and(eq(users.role, 'admin'), eq(users.isActive, true)));
	return rows.map((row) => row.userId).filter((userId) => userId !== excludeUserId);
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
	message: PushMessage;
}

/** Notificaciones de una entrega para supervisores y administradores activos (excepto el actor). */
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
		/** Usuario que envía: no recibe su propia notificación. */
		actorId: string;
	}
): Promise<OutboundNotification> {
	const [supervisors, admins] = await Promise.all([
		resolveServiceRecipients(db, context.serviceId, 'supervisor'),
		resolveAdminRecipients(db, context.actorId)
	]);
	const recipientIds = [...new Set([...supervisors, ...admins])];
	const message = submissionSubmittedMessage(context);

	await insertNotifications(
		db,
		recipientIds.map((recipientUserId) => ({
			recipientUserId,
			serviceId: context.serviceId,
			targetId: context.targetId,
			submissionId: context.submissionId,
			reviewId: null,
			eventType: 'submission.submitted',
			title: message.title,
			body: message.body,
			deepLink: message.deepLink,
			eventKey: message.eventKey
		}))
	);

	return { recipientIds, message: message.push };
}

/** Notificaciones de una decisión para técnicos y administradores activos (excepto el actor). */
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
		/** Usuario que revisa: no recibe su propia notificación. */
		actorId: string;
	}
): Promise<OutboundNotification> {
	const [technicians, admins] = await Promise.all([
		resolveServiceRecipients(db, context.serviceId, 'technician'),
		resolveAdminRecipients(db, context.actorId)
	]);
	const recipientIds = [...new Set([...technicians, ...admins])];
	const message = submissionReviewedMessage(context);

	await insertNotifications(
		db,
		recipientIds.map((recipientUserId) => ({
			recipientUserId,
			serviceId: context.serviceId,
			targetId: context.targetId,
			submissionId: context.submissionId,
			reviewId: context.reviewId,
			eventType: context.decision === 'approved' ? 'submission.approved' : 'submission.rejected',
			title: message.title,
			body: message.body,
			deepLink: message.deepLink,
			eventKey: message.eventKey
		}))
	);

	return { recipientIds, message: message.push };
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
