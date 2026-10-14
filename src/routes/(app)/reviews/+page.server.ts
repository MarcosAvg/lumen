import { error } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listPendingReviews } from '#lib/server/domain/submissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	if (user.role === 'technician') {
		throw error(403, 'No tienes acceso a la revisión de entregas.');
	}
	return { pending: await listPendingReviews(getDatabase().db, user) };
};
