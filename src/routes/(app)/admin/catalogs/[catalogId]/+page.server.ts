import { fail, redirect } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { orHttp } from '#lib/server/http';
import {
	createCatalogItem,
	deleteCatalog,
	deleteCatalogItem,
	getCatalog,
	getCatalogItemImpact,
	getCatalogMeta,
	listCatalogsWithItems,
	listCatalogTypes,
	moveCatalogItem,
	renameCatalogItem,
	searchCatalogItems,
	updateCatalog
} from '#lib/server/domain/catalogs';
import { failFrom, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import {
	createCatalogItemSchema,
	deleteCatalogItemSchema,
	renameCatalogItemSchema,
	updateCatalogSchema
} from '#lib/schemas/catalogs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	requireAdmin(locals);
	const catalogId = requireUuidParam(params.catalogId, 'Catálogo');
	const db = getDatabase().db;

	const q = url.searchParams.get('q') ?? '';
	const page = Math.max(Number(url.searchParams.get('page') ?? '1') || 1, 1);
	const PAGE_SIZE = 25;

	const [catalog, itemsPage, types, allCatalogs] = await Promise.all([
		orHttp(getCatalogMeta(db, catalogId)),
		searchCatalogItems(db, catalogId, { q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
		listCatalogTypes(db),
		listCatalogsWithItems(db)
	]);

	return {
		title: catalog.name,
		back: { href: '/admin/catalogs', label: 'Catálogos' },
		catalog,
		items: itemsPage.items,
		total: itemsPage.total,
		page,
		pageSize: PAGE_SIZE,
		q,
		types,
		buildingCatalogs: allCatalogs.filter((entry) => entry.typeSystemRole === 'building')
	};
};

export const actions: Actions = {
	updateCatalog: async (event) => {
		const admin = requireAdmin(event.locals);
		const form = await event.request.formData();
		const parsed = parseForm(updateCatalogSchema, form);
		if (!parsed.ok) return fail(400, { message: 'Datos del catálogo inválidos.' });

		try {
			await updateCatalog(getDatabase().db, {
				catalogId: parsed.data.catalogId,
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
			const { items } = await orHttp(getCatalog(db, catalogId));
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

	moveItem: async (event) => {
		const admin = requireAdmin(event.locals);
		const form = await event.request.formData();
		const itemId = form.get('itemId');
		const direction = form.get('direction') === 'up' ? -1 : 1;
		if (typeof itemId !== 'string' || itemId.length === 0) {
			return fail(400, { message: 'Ítem inválido.' });
		}
		try {
			await moveCatalogItem(getDatabase().db, { itemId, direction, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Orden actualizado.' };
	},

	deleteCatalog: async (event) => {
		const admin = requireAdmin(event.locals);
		const catalogId = requireUuidParam(event.params.catalogId, 'Catálogo');
		const form = await event.request.formData();
		const db = getDatabase().db;

		if (form.get('confirm') !== 'true') {
			const { catalog, items } = await orHttp(getCatalog(db, catalogId));
			return { pendingCatalogDelete: { catalogId, name: catalog.name, itemCount: items.length } };
		}

		try {
			await deleteCatalog(db, { catalogId, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		// Evita reejecutar el `load` sobre un catálogo ya eliminado.
		throw redirect(303, '/admin/catalogs');
	}
};
