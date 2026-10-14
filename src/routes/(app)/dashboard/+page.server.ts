import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listServicesForUser } from '#lib/server/domain/services';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const services = await listServicesForUser(getDatabase().db, user);
	return { services };
};
