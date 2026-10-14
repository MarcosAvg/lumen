import { fail } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { createService, listServicesForUser } from '#lib/server/domain/services';
import { failFrom, parseForm } from '#lib/server/forms';
import { createServiceSchema } from '#lib/schemas/services';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const admin = requireAdmin(locals);
	return { services: await listServicesForUser(getDatabase().db, admin) };
};

export const actions: Actions = {
	create: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(createServiceSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { createErrors: parsed.errors });

		try {
			await createService(getDatabase().db, {
				name: parsed.data.name,
				description: parsed.data.description,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Servicio creado.' };
	}
};
