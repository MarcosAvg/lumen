import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { searchByName } from '#lib/server/domain/search';
import type { RequestHandler } from './$types';

/** Búsqueda global filtrada por el ámbito del usuario (nunca revela recursos ajenos). */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals);
	const q = url.searchParams.get('q') ?? '';
	const rawOffset = Number(url.searchParams.get('offset') ?? '0');
	const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
	const results = await searchByName(getDatabase().db, user, q, { offset });
	return json({ results, offset });
};
