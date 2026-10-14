import { fail } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { createCatalog, listCatalogs } from '#lib/server/domain/catalogs';
import { failFrom, parseForm } from '#lib/server/forms';
import { createCatalogSchema } from '#lib/schemas/catalogs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	return { catalogs: await listCatalogs(getDatabase().db) };
};

export const actions: Actions = {
	create: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(createCatalogSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { createErrors: parsed.errors });

		try {
			await createCatalog(getDatabase().db, {
				name: parsed.data.name,
				description: parsed.data.description,
				purpose: parsed.data.purpose,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Catálogo creado.' };
	}
};
