import { fail } from '@sveltejs/kit';
import { requireAdmin, requireServiceAccess, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listCatalogsWithItems } from '#lib/server/domain/catalogs';
import { loadEvidence } from '#lib/server/domain/photos';
import { getHistory, getLatestRejection } from '#lib/server/domain/submissions';
import { getWorkForConversion } from '#lib/server/domain/structure';
import { isEditableStatus, getTargetForWork } from '#lib/server/domain/targets';
import {
	createElement,
	getWorkDetail,
	listElementsDetailed,
	updateElement,
	updateWork
} from '#lib/server/domain/works';
import { failFrom, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import { createElementSchema, updateElementSchema, updateWorkSchema } from '#lib/schemas/works';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const workId = requireUuidParam(params.workId, 'Trabajo');
	const user = requireUser(locals);
	const db = getDatabase().db;

	const work = await getWorkDetail(db, workId);
	// Verifica el ámbito del servicio al que pertenece el trabajo.
	await requireServiceAccess(locals, work.serviceId);

	if (work.mode === 'direct') {
		const target = await getTargetForWork(db, workId);
		const [evidence, history, rejection] = await Promise.all([
			loadEvidence(db, target.id),
			getHistory(db, target.id),
			getLatestRejection(db, target.id)
		]);
		const conversion = user.role === 'admin' ? await getWorkForConversion(db, workId) : null;
		return {
			work,
			elements: [],
			evidence,
			history,
			rejection,
			conversion,
			catalogs: [],
			editable: isEditableStatus(target.status),
			isAdmin: user.role === 'admin'
		};
	}

	const elements = await listElementsDetailed(db, workId);
	const [conversion, catalogs] = await Promise.all([
		user.role === 'admin' ? getWorkForConversion(db, workId) : Promise.resolve(null),
		user.role === 'admin' ? listCatalogsWithItems(db) : Promise.resolve([])
	]);
	return {
		work,
		elements,
		evidence: null,
		history: [],
		rejection: null,
		conversion,
		catalogs,
		editable: false,
		isAdmin: user.role === 'admin'
	};
};
export const actions: Actions = {
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
		return { success: 'Trabajo actualizado.' };
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
		return { success: 'Elemento añadido.' };
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
