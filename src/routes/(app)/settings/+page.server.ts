import { fail } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import {
	countPushSubscriptions,
	dispatchPushToUsers,
	getVapidPublicKey,
	isPushConfigured
} from '#lib/server/domain/push';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	return {
		title: 'Perfil',
		push: {
			configured: isPushConfigured(),
			publicKey: getVapidPublicKey(),
			subscriptions: await countPushSubscriptions(getDatabase().db, user.id)
		}
	};
};

/** Envía una notificación push de prueba al propio usuario (a sus dispositivos). */
export const actions: Actions = {
	test: async ({ locals }) => {
		const user = requireUser(locals);
		const result = await dispatchPushToUsers(getDatabase().db, [user.id], {
			title: 'Notificación de prueba',
			body: 'Si ves este aviso, las notificaciones push funcionan en este dispositivo.',
			url: '/notifications',
			tag: 'push-test'
		});

		if (result.skipped) {
			return fail(400, { testError: 'Web Push no está configurado en el servidor.' });
		}
		if (result.sent === 0) {
			return fail(400, {
				testError: 'No se pudo entregar: este dispositivo no tiene una suscripción push activa.'
			});
		}
		return {
			testMessage: `Notificación de prueba enviada a ${result.sent} dispositivo(s)${
				result.revoked > 0 ? ` (${result.revoked} suscripción(es) revocada(s))` : ''
			}.`
		};
	}
};
