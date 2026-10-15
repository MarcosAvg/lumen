import { error } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listServicesForUser } from '#lib/server/domain/services';
import { listPendingReviews } from '#lib/server/domain/submissions';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	if (user.role === 'technician') {
		throw error(403, 'No tienes acceso a la revisión de entregas.');
	}
	const db = getDatabase().db;

	const serviceId = url.searchParams.get('serviceId');
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	const q = url.searchParams.get('q') ?? '';
	const page = Math.max(Number(url.searchParams.get('page') ?? '1') || 1, 1);

	const [{ items, total }, services] = await Promise.all([
		listPendingReviews(db, user, {
			serviceId: serviceId || null,
			from: from ? new Date(`${from}T00:00:00.000Z`) : null,
			to: to ? new Date(`${to}T23:59:59.999Z`) : null,
			q,
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE
		}),
		listServicesForUser(db, user)
	]);

	return {
		title: 'Revisiones',
		pending: items,
		total,
		page,
		pageSize: PAGE_SIZE,
		filters: { serviceId: serviceId ?? '', from: from ?? '', to: to ?? '', q },
		services
	};
};
