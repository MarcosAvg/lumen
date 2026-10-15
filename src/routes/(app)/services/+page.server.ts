import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listServicesForUser } from '#lib/server/domain/services';
import { listServiceProgress } from '#lib/server/domain/works';
import type { PageServerLoad } from './$types';

/** Lista de servicios del usuario: admin (todos) o asignados vigentes. */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const db = getDatabase().db;

	const services = await listServicesForUser(db, user);
	const progress = await listServiceProgress(
		db,
		services.map((service) => service.id)
	);

	return {
		title: 'Servicios',
		services: services.map((service) => {
			const entry = progress.get(service.id) ?? { totalTargets: 0, approvedTargets: 0 };
			return {
				...service,
				totalTargets: entry.totalTargets,
				approvedTargets: entry.approvedTargets,
				percent:
					entry.totalTargets === 0
						? 0
						: Math.round((entry.approvedTargets / entry.totalTargets) * 100)
			};
		})
	};
};
