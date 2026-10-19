import { fail } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import {
	createCatalog,
	createCatalogType,
	deleteCatalogType,
	listCatalogs,
	listCatalogsWithItems,
	listCatalogTypes,
	updateCatalogType
} from '#lib/server/domain/catalogs';
import { failFrom, parseForm } from '#lib/server/forms';
import {
	createCatalogSchema,
	createCatalogTypeSchema,
	deleteCatalogTypeSchema,
	updateCatalogTypeSchema
} from '#lib/schemas/catalogs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const q = url.searchParams.get('q') ?? '';
	const db = getDatabase().db;
	const [catalogs, types, withItems] = await Promise.all([
		listCatalogs(db, q),
		listCatalogTypes(db),
		listCatalogsWithItems(db)
	]);
	return {
		title: 'Catálogos',
		catalogs,
		types,
		q,
		buildingCatalogs: withItems.filter((catalog) => catalog.typeSystemRole === 'building')
	};
};

export const actions: Actions = {
	create: async (event) => {
		const admin = requireAdmin(event.locals);
		const form = await event.request.formData();
		const parsed = parseForm(createCatalogSchema, form);
		if (!parsed.ok) return fail(400, { createErrors: parsed.errors });

		try {
			await createCatalog(getDatabase().db, {
				name: parsed.data.name,
				description: parsed.data.description,
				typeId: parsed.data.typeId,
				allBuildings: parsed.data.allBuildings !== 'false',
				buildingCatalogItemIds: form.getAll('buildingIds').map(String),
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Catálogo creado.' };
	},

	createType: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(createCatalogTypeSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { typeErrors: parsed.errors });

		try {
			await createCatalogType(getDatabase().db, {
				name: parsed.data.name,
				sortOrder: parsed.data.sortOrder,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Tipo de catálogo creado.' };
	},

	updateType: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(updateCatalogTypeSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Datos del tipo inválidos.' });

		try {
			await updateCatalogType(getDatabase().db, {
				typeId: parsed.data.typeId,
				name: parsed.data.name,
				sortOrder: parsed.data.sortOrder,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Tipo de catálogo actualizado.' };
	},

	deleteType: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(deleteCatalogTypeSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Tipo inválido.' });

		try {
			await deleteCatalogType(getDatabase().db, { typeId: parsed.data.typeId, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Tipo de catálogo eliminado.' };
	}
};
