import { redirect } from '@sveltejs/kit';
import { getDatabase } from '#lib/server/db';
import { countPendingReviews } from '#lib/server/domain/dashboard';
import { unreadNotificationCount } from '#lib/server/domain/notifications';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	const db = getDatabase().db;
	const [unreadCount, reviewsCount] = await Promise.all([
		unreadNotificationCount(db, locals.user.id),
		countPendingReviews(db, locals.user)
	]);
	return {
		user: locals.user,
		unreadCount,
		reviewsCount
	};
};
