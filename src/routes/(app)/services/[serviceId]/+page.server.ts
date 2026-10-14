import { requireServiceAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listParticipants } from '#lib/server/domain/services';
import { requireUuidParam } from '#lib/server/params';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const serviceId = requireUuidParam(params.serviceId, 'Servicio');
	const { service, access } = await requireServiceAccess(locals, serviceId);
	const participants = await listParticipants(getDatabase().db, serviceId);

	return { service, access, participants };
};
