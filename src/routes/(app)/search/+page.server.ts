import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { searchByName } from '#lib/server/domain/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const q = url.searchParams.get('q') ?? '';
	const results = q.trim() ? await searchByName(getDatabase().db, user, q) : [];
	return { q, results };
};
