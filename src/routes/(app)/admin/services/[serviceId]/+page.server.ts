import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { requireUuidParam } from '#lib/server/params';
import type { PageServerLoad } from './$types';

/**
 * La gestión de asignaciones vive ahora en un modal de la ficha del servicio.
 * Se conserva esta ruta como redirección para enlaces antiguos.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	requireAdmin(locals);
	const serviceId = requireUuidParam(params.serviceId, 'Servicio');
	throw redirect(308, `/services/${serviceId}`);
};
