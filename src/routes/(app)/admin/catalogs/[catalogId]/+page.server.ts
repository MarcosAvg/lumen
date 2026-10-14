import { fail } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import {
	createCatalogItem,
	createRelation,
	deleteCatalog,
	deleteCatalogItem,
	deleteRelation,
	getCatalog,
	getCatalogItemImpact,
	listAllItemOptions,
	listRelationsForCatalog,
	renameCatalogItem,
	updateCatalog
} from '#lib/server/domain/catalogs';
import { failFrom, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import {
	createCatalogItemSchema,
	createRelationSchema,
	deleteCatalogItemSchema,
	deleteRelationSchema,
	renameCatalogItemSchema,
	updateCatalogSchema
} from '#lib/schemas/catalogs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireAdmin(locals);
	const catalogId = requireUuidParam(params.catalogId, 'Catálogo');
	const db = getDatabase().db;

	const [{ catalog, items }, relations, otherItems] = await Promise.all([
		getCatalog(db, catalogId),
		listRelationsForCatalog(db, catalogId),
		listAllItemOptions(db, catalogId)
	]);

	return { catalog, items, relations, otherItems };
};

export const actions: Actions = {
	updateCatalog: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(updateCatalogSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Datos del catálogo inválidos.' });

		try {
			await updateCatalog(getDatabase().db, { ...parsed.data, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Catálogo actualizado.' };
	},

	createItem: async (event) => {
		const admin = requireAdmin(event.locals);
		const catalogId = requireUuidParam(event.params.catalogId, 'Catálogo');
		const parsed = parseForm(createCatalogItemSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { createErrors: parsed.errors });

		try {
			await createCatalogItem(getDatabase().db, {
				catalogId,
				name: parsed.data.name,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Ítem añadido.' };
	},

	renameItem: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(renameCatalogItemSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Ítem inválido.' });

		try {
			await renameCatalogItem(getDatabase().db, { ...parsed.data, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Ítem renombrado. Los objetos vinculados muestran el nuevo nombre.' };
	},

	deleteItem: async (event) => {
		const admin = requireAdmin(event.locals);
		const catalogId = requireUuidParam(event.params.catalogId, 'Catálogo');
		const form = await event.request.formData();
		const parsed = parseForm(deleteCatalogItemSchema, form);
		if (!parsed.ok) return fail(400, { message: 'Ítem inválido.' });

		const db = getDatabase().db;

		if (form.get('confirm') !== 'true') {
			const { items } = await getCatalog(db, catalogId);
			const item = items.find((row) => row.id === parsed.data.itemId);
			const impact = await getCatalogItemImpact(db, parsed.data.itemId);
			return { pendingDelete: { itemId: parsed.data.itemId, name: item?.name ?? '', impact } };
		}

		try {
			await deleteCatalogItem(db, { itemId: parsed.data.itemId, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Ítem eliminado. Las instancias vinculadas conservaron su nombre.' };
	},

	createRelation: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(createRelationSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Relación inválida.' });

		try {
			await createRelation(getDatabase().db, { ...parsed.data, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Relación creada.' };
	},

	deleteRelation: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(deleteRelationSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Relación inválida.' });

		try {
			await deleteRelation(getDatabase().db, parsed.data.relationId, admin.id);
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Relación eliminada.' };
	},

	deleteCatalog: async (event) => {
		const admin = requireAdmin(event.locals);
		const catalogId = requireUuidParam(event.params.catalogId, 'Catálogo');
		const form = await event.request.formData();
		const db = getDatabase().db;

		if (form.get('confirm') !== 'true') {
			const { catalog, items } = await getCatalog(db, catalogId);
			return { pendingCatalogDelete: { catalogId, name: catalog.name, itemCount: items.length } };
		}

		try {
			await deleteCatalog(db, { catalogId, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Catálogo eliminado; los nombres de sus ítems se conservaron.' };
	}
};
