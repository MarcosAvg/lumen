import { fail } from '@sveltejs/kit';
import { requireAdmin, requireServiceAccess, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { loadEvidence } from '#lib/server/domain/photos';
import { isEditableStatus, getTargetForWork } from '#lib/server/domain/targets';
import {
	getWorkDetail,
	listElementsDetailed,
	updateElement,
	updateWork
} from '#lib/server/domain/works';
import { failFrom, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import { updateElementSchema, updateWorkSchema } from '#lib/schemas/works';
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
		const evidence = await loadEvidence(db, target.id);
		return {
			work,
			elements: [],
			evidence,
			editable: isEditableStatus(target.status),
			isAdmin: user.role === 'admin'
		};
	}

	const elements = await listElementsDetailed(db, workId);
	return { work, elements, evidence: null, editable: false, isAdmin: user.role === 'admin' };
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
