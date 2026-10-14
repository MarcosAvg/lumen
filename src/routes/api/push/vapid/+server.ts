import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards';
import { getVapidPublicKey, isPushConfigured } from '#lib/server/domain/push';
import type { RequestHandler } from './$types';

/** Expone la clave pública VAPID (nunca la privada) para registrar suscripciones. */
export const GET: RequestHandler = async ({ locals }) => {
	requireUser(locals);
	return json({ configured: isPushConfigured(), publicKey: getVapidPublicKey() });
};
