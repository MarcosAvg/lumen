import { redirect } from '@sveltejs/kit';
import { getDatabase } from '#lib/server/db';
import { isSetupRequired } from '#lib/server/domain/users';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (await isSetupRequired(getDatabase().db)) throw redirect(303, '/setup');
	if (!locals.user) throw redirect(303, '/login');
	throw redirect(303, '/dashboard');
};
