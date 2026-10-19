import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAdmin, requireServiceAccess, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { orHttp } from '#lib/server/http';
import { listCatalogsAvailableForService } from '#lib/server/domain/catalogs';
import { loadEvidence } from '#lib/server/domain/photos';
import { getHistory, getLatestRejection } from '#lib/server/domain/submissions';
import { getWorkForConversion } from '#lib/server/domain/structure';
import { isEditableStatus, getTargetForWork } from '#lib/server/domain/targets';
import {
	addElements,
	getWorkDetail,
	listElementsDetailed,
	updateElement,
	updateWork
} from '#lib/server/domain/works';
import { failFrom, fieldErrors, parseForm } from '#lib/server/forms';
import { isUuid, requireUuidParam } from '#lib/server/params';
import { createWorkElementSchema, updateElementSchema, updateWorkSchema } from '#lib/schemas/works';
import { requirementDraftSchema } from '#lib/schemas/requirements';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const workId = requireUuidParam(params.workId, 'Trabajo');
	const user = requireUser(locals);
	const db = getDatabase().db;

	const work = await orHttp(getWorkDetail(db, workId));
	// Verifica el ámbito del servicio al que pertenece el trabajo.
	const { access, service } = await requireServiceAccess(locals, work.serviceId);
	const canExport = access !== 'technician';
	const serviceActive = service.lifecycle === 'active';

	if (work.mode === 'direct') {
		const target = await orHttp(getTargetForWork(db, workId));
		const [evidence, history, rejection, conversion] = await Promise.all([
			loadEvidence(db, target.id),
			getHistory(db, target.id),
			getLatestRejection(db, target.id),
			user.role === 'admin' ? getWorkForConversion(db, workId) : Promise.resolve(null)
		]);
		// Solo se usan para el selector de requisitos (trabajo directo).
		const catalogs =
			user.role === 'admin' ? await listCatalogsAvailableForService(db, work.serviceId) : [];
		return {
			title: work.name,
			back: { href: `/services/${work.serviceId}`, label: work.serviceName },
			work,
			elements: [],
			evidence,
			history,
			rejection,
			conversion,
			catalogs,
			serviceLifecycle: service.lifecycle,
			editable: serviceActive && isEditableStatus(target.status),
			isAdmin: user.role === 'admin',
			canExport
		};
	}

	const elements = await listElementsDetailed(db, workId);
	const [conversion, catalogs] = await Promise.all([
		user.role === 'admin' ? getWorkForConversion(db, workId) : Promise.resolve(null),
		user.role === 'admin'
			? listCatalogsAvailableForService(db, work.serviceId)
			: Promise.resolve([])
	]);
	return {
		title: work.name,
		back: { href: `/services/${work.serviceId}`, label: work.serviceName },
		work,
		elements,
		evidence: null,
		history: [],
		rejection: null,
		conversion,
		catalogs,
		serviceLifecycle: service.lifecycle,
		editable: false,
		isAdmin: user.role === 'admin',
		canExport
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

	createElements: async (event) => {
		const admin = requireAdmin(event.locals);
		const form = await event.request.formData();
		const workId = String(form.get('workId') ?? '');
		if (!isUuid(workId)) return fail(400, { elementErrors: { _form: 'Trabajo inválido.' } });

		let raw: unknown;
		try {
			raw = JSON.parse(String(form.get('elements') ?? '[]'));
		} catch {
			raw = null;
		}
		const parsed = z.array(createWorkElementSchema).min(1).safeParse(raw);
		if (!parsed.success) return fail(400, { elementErrors: fieldErrors(parsed.error) });

		let requirements: { name?: string; catalogItemId?: string }[];
		try {
			const result = z
				.array(requirementDraftSchema)
				.safeParse(JSON.parse(String(form.get('requirements') ?? '[]')));
			if (!result.success) return fail(400, { elementErrors: fieldErrors(result.error) });
			requirements = result.data;
		} catch {
			return fail(400, { elementErrors: { _form: 'Requisitos inválidos.' } });
		}

		try {
			await addElements(getDatabase().db, {
				workId,
				elements: parsed.data,
				requirements,
				requirementIsRequired: String(form.get('requirementIsRequired') ?? 'true') === 'true',
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Elementos añadidos.' };
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
