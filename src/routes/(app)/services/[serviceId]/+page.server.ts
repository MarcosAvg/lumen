import { fail } from '@sveltejs/kit';
import { requireAdmin, requireServiceAccess, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listCatalogsWithItems } from '#lib/server/domain/catalogs';
import { listParticipants, updateService } from '#lib/server/domain/services';
import {
	createElement,
	createWork,
	getServiceProgress,
	listWorksDetailed,
	updateElement,
	updateWork
} from '#lib/server/domain/works';
import { failFrom, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import { updateServiceSchema } from '#lib/schemas/services';
import {
	createElementSchema,
	createWorkSchema,
	updateElementSchema,
	updateWorkSchema
} from '#lib/schemas/works';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const serviceId = requireUuidParam(params.serviceId, 'Servicio');
	const user = requireUser(locals);
	const { service, access } = await requireServiceAccess(locals, serviceId);
	const db = getDatabase().db;

	const [participants, works, progress, catalogs] = await Promise.all([
		listParticipants(db, serviceId),
		listWorksDetailed(db, serviceId),
		getServiceProgress(db, serviceId),
		user.role === 'admin' ? listCatalogsWithItems(db) : Promise.resolve([])
	]);

	return {
		service,
		access,
		participants,
		works,
		progress,
		catalogs,
		isAdmin: user.role === 'admin'
	};
};

export const actions: Actions = {
	updateService: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(updateServiceSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Datos del servicio inválidos.' });

		try {
			await updateService(getDatabase().db, {
				serviceId: parsed.data.serviceId,
				name: parsed.data.name,
				description: parsed.data.description,
				buildingCatalogItemId: parsed.data.buildingItemId || null,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Servicio actualizado.' };
	},

	createWork: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(createWorkSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { workErrors: parsed.errors });

		try {
			await createWork(getDatabase().db, {
				serviceId: parsed.data.serviceId,
				mode: parsed.data.mode,
				name: parsed.data.name,
				catalogItemId: parsed.data.catalogItemId || null,
				description: parsed.data.description,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Trabajo creado.' };
	},

	createElement: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(createElementSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { elementErrors: parsed.errors });

		try {
			await createElement(getDatabase().db, {
				workId: parsed.data.workId,
				name: parsed.data.name,
				catalogItemId: parsed.data.catalogItemId || null,
				description: parsed.data.description,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Elemento creado.' };
	},

	updateWork: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(updateWorkSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Datos del trabajo inválidos.' });

		try {
			await updateWork(getDatabase().db, {
				id: parsed.data.workId,
				name: parsed.data.name,
				description: parsed.data.description,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return {
			success: 'Trabajo actualizado. Si renombraste un ítem vinculado, quedó desvinculado.'
		};
	},

	updateElement: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(updateElementSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Datos del elemento inválidos.' });

		try {
			await updateElement(getDatabase().db, {
				id: parsed.data.elementId,
				name: parsed.data.name,
				description: parsed.data.description,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Elemento actualizado.' };
	}
};
