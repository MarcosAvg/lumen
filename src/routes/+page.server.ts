import { checkHealth } from '$lib/server/db/health';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const health = await checkHealth();
	return { health };
};
