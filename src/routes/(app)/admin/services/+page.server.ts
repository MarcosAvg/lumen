import { fail } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listContractsForUser } from '#lib/server/domain/contracts';
import { createService, listServicesForUser } from '#lib/server/domain/services';
import { failFrom, parseForm } from '#lib/server/forms';
import { createServiceSchema } from '#lib/schemas/services';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const admin = requireAdmin(locals);
	const db = getDatabase().db;
	const [services, contracts] = await Promise.all([
		listServicesForUser(db, admin),
		listContractsForUser(db, admin)
	]);
	return { title: 'Servicios', services, contracts };
};

export const actions: Actions = {
	create: async (event) => {
		const admin = requireAdmin(event.locals);
		const formData = await event.request.formData();
		const parsed = parseForm(createServiceSchema, formData);
		if (!parsed.ok) return fail(400, { createErrors: parsed.errors });

		try {
			await createService(getDatabase().db, {
				contractId: parsed.data.contractId,
				name: parsed.data.name,
				description: parsed.data.description,
				lifecycle:
					formData.get('planned') === 'on' || formData.get('planned') === 'true'
						? 'planned'
						: 'active',
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Servicio creado.' };
	}
};
