import { redirect } from '@sveltejs/kit';
import { getDatabase } from '#lib/server/db';
import { unreadNotificationCount } from '#lib/server/domain/notifications';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	return {
		user: locals.user,
		unreadCount: await unreadNotificationCount(getDatabase().db, locals.user.id)
	};
};
