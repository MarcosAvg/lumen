import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAdmin, requireServiceAccess, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listCatalogsWithItems } from '#lib/server/domain/catalogs';
import { listParticipants, updateService } from '#lib/server/domain/services';
import {
	createWork,
	getServiceProgress,
	listWorksDetailed,
	updateElement,
	updateWork
} from '#lib/server/domain/works';
import { failFrom, fieldErrors, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import { updateServiceSchema } from '#lib/schemas/services';
import {
	createWorkElementSchema,
	createWorkSchema,
	updateElementSchema,
	updateWorkSchema
} from '#lib/schemas/works';
import { requirementDraftSchema } from '#lib/schemas/requirements';
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
		title: service.name,
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

		let elements: { name?: string; catalogItemId?: string }[] = [];
		if (parsed.data.mode === 'divided') {
			let raw: unknown;
			try {
				raw = JSON.parse(parsed.data.elements || '[]');
			} catch {
				raw = null;
			}
			const result = z.array(createWorkElementSchema).safeParse(raw);
			if (!result.success) return fail(400, { workErrors: fieldErrors(result.error) });
			elements = result.data;
		}

		let requirements: { name?: string; catalogItemId?: string }[];
		try {
			const raw = JSON.parse(parsed.data.requirements || '[]');
			const result = z.array(requirementDraftSchema).safeParse(raw);
			if (!result.success) return fail(400, { workErrors: fieldErrors(result.error) });
			requirements = result.data;
		} catch {
			return fail(400, { workErrors: { _form: 'Requisitos inválidos.' } });
		}

		try {
			await createWork(getDatabase().db, {
				serviceId: parsed.data.serviceId,
				mode: parsed.data.mode,
				name: parsed.data.name,
				catalogItemId: parsed.data.catalogItemId || null,
				description: parsed.data.description,
				elements,
				requirements,
				requirementIsRequired: parsed.data.requirementIsRequired === 'true',
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Trabajo creado.' };
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
