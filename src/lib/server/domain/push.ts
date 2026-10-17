import webpush from 'web-push';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { VAPID_PUBLIC_KEY } from '$app/env/public';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '$app/env/private';
import type { Database } from '#lib/server/db';
import { pushSubscriptions } from '#lib/server/db/schema';
import { DomainError } from './errors';
import type { PushMessage } from './push-messages';

export type { PushMessage };

/**
 * Web Push estándar con VAPID (docs/referencia/arquitectura.md). El envío es **best-effort** y ocurre
 * siempre después del commit; un fallo de push nunca revierte la operación de
 * evidencia ni la notificación interna.
 */

let configured = false;

/** Push solo está operativo si las tres variables VAPID están presentes. */
export function isPushConfigured(): boolean {
	return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}

export function getVapidPublicKey(): string | null {
	return VAPID_PUBLIC_KEY ?? null;
}

function ensureConfigured(): boolean {
	if (!isPushConfigured()) return false;
	if (!configured) {
		webpush.setVapidDetails(
			VAPID_SUBJECT as string,
			VAPID_PUBLIC_KEY as string,
			VAPID_PRIVATE_KEY as string
		);
		configured = true;
	}
	return true;
}

export interface SubscriptionInput {
	endpoint: string;
	p256dh: string;
	auth: string;
	userAgent?: string | null;
}

/**
 * Registra (o reactiva) la suscripción de un dispositivo. El `endpoint` es único:
 * un mismo dispositivo re-registrado por otro usuario se reasigna al actual.
 */
export async function savePushSubscription(
	db: Database,
	userId: string,
	input: SubscriptionInput
): Promise<void> {
	await db
		.insert(pushSubscriptions)
		.values({
			userId,
			endpoint: input.endpoint,
			p256dh: input.p256dh,
			auth: input.auth,
			userAgent: input.userAgent ?? null
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: {
				userId,
				p256dh: input.p256dh,
				auth: input.auth,
				userAgent: input.userAgent ?? null,
				revokedAt: null
			}
		});
}

/** Elimina (físicamente) la suscripción de un dispositivo del propio usuario. */
export async function removePushSubscription(
	db: Database,
	userId: string,
	endpoint: string
): Promise<boolean> {
	const removed = await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
		.returning({ id: pushSubscriptions.id });
	return removed.length > 0;
}

export async function countPushSubscriptions(db: Database, userId: string): Promise<number> {
	const rows = await db
		.select({ id: pushSubscriptions.id })
		.from(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.revokedAt)));
	return rows.length;
}

export interface PushDispatchResult {
	sent: number;
	revoked: number;
	skipped: boolean;
}

/**
 * Intenta enviar un mensaje a las suscripciones activas de los destinatarios.
 * No lanza: tolera fallos de red/proveedor y revoca suscripciones inválidas
 * (`404`/`410`). Devuelve un resumen para logs.
 */
export async function dispatchPushToUsers(
	db: Database,
	userIds: string[],
	message: PushMessage
): Promise<PushDispatchResult> {
	if (!ensureConfigured() || userIds.length === 0) {
		return { sent: 0, revoked: 0, skipped: true };
	}

	const subscriptions = await db
		.select()
		.from(pushSubscriptions)
		.where(and(inArray(pushSubscriptions.userId, userIds), isNull(pushSubscriptions.revokedAt)));

	let sent = 0;
	let revoked = 0;
	const payload = JSON.stringify(message);

	for (const subscription of subscriptions) {
		try {
			await webpush.sendNotification(
				{
					endpoint: subscription.endpoint,
					keys: { p256dh: subscription.p256dh, auth: subscription.auth }
				},
				payload,
				{ TTL: 3600 }
			);
			sent += 1;
			await db
				.update(pushSubscriptions)
				.set({ lastSuccessAt: new Date() })
				.where(eq(pushSubscriptions.id, subscription.id));
		} catch (error) {
			const statusCode = (error as { statusCode?: number }).statusCode;
			if (statusCode === 404 || statusCode === 410) {
				await db
					.update(pushSubscriptions)
					.set({ revokedAt: new Date() })
					.where(eq(pushSubscriptions.id, subscription.id));
				revoked += 1;
			} else {
				console.error('[push] envío fallido', statusCode ?? error);
			}
		}
	}

	return { sent, revoked, skipped: false };
}

/** Valida la forma mínima de un `PushSubscription` antes de persistirlo. */
export function assertValidSubscription(input: SubscriptionInput): void {
	if (!/^https:\/\//.test(input.endpoint)) {
		throw new DomainError(400, 'El endpoint de push debe ser una URL HTTPS.');
	}
	if (!input.p256dh || !input.auth) {
		throw new DomainError(400, 'La suscripción de push está incompleta.');
	}
}
