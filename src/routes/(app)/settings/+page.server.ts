import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import {
	countPushSubscriptions,
	getVapidPublicKey,
	isPushConfigured
} from '#lib/server/domain/push';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	return {
		title: 'Ajustes',
		push: {
			configured: isPushConfigured(),
			publicKey: getVapidPublicKey(),
			subscriptions: await countPushSubscriptions(getDatabase().db, user.id)
		}
	};
};
