import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import {
	assertValidSubscription,
	removePushSubscription,
	savePushSubscription
} from '#lib/server/domain/push';
import { fieldErrors } from '#lib/server/forms';
import { pushSubscriptionSchema, removePushSubscriptionSchema } from '#lib/schemas/notifications';
import type { RequestHandler } from './$types';

/** Registra (o reactiva) la suscripción push del dispositivo actual. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const parsed = pushSubscriptionSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ message: 'Suscripción inválida.', details: fieldErrors(parsed.error) },
			{ status: 400 }
		);
	}

	try {
		assertValidSubscription({
			endpoint: parsed.data.endpoint,
			p256dh: parsed.data.keys.p256dh,
			auth: parsed.data.keys.auth
		});
		await savePushSubscription(getDatabase().db, user.id, {
			endpoint: parsed.data.endpoint,
			p256dh: parsed.data.keys.p256dh,
			auth: parsed.data.keys.auth,
			userAgent: request.headers.get('user-agent')
		});
		return json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
};

/** Elimina la suscripción del dispositivo actual del usuario. */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const parsed = removePushSubscriptionSchema.safeParse(body);
	if (!parsed.success) {
		return json({ message: 'Suscripción inválida.' }, { status: 400 });
	}

	try {
		const removed = await removePushSubscription(getDatabase().db, user.id, parsed.data.endpoint);
		return json({ ok: true, removed });
	} catch (error) {
		return errorResponse(error);
	}
};
