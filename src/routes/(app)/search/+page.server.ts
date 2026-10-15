import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { searchByName, type SearchResultType } from '#lib/server/domain/search';
import { listServicesForUser } from '#lib/server/domain/services';
import type { PageServerLoad } from './$types';

const TYPES: SearchResultType[] = ['service', 'work', 'element'];

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const db = getDatabase().db;
	const q = url.searchParams.get('q') ?? '';
	const rawType = url.searchParams.get('type') ?? '';
	const serviceId = url.searchParams.get('serviceId') ?? '';
	const types = TYPES.includes(rawType as SearchResultType)
		? [rawType as SearchResultType]
		: undefined;

	const [results, services] = await Promise.all([
		q.trim() ? searchByName(db, user, q, { types, serviceId: serviceId || null }) : [],
		listServicesForUser(db, user)
	]);

	return { q, results, services, filters: { type: rawType, serviceId } };
};
