import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listCatalogsWithItems } from '#lib/server/domain/catalogs';
import { getServiceForUser } from '#lib/server/domain/services';
import {
	applyGeneration,
	planGeneration,
	type GenerationElement,
	type GenerationWork
} from '#lib/server/domain/works';
import { failFrom } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const admin = requireAdmin(locals);
	const serviceId = requireUuidParam(params.serviceId, 'Servicio');
	const db = getDatabase().db;
	const { service } = await getServiceForUser(db, admin, serviceId);
	const catalogs = await listCatalogsWithItems(db);
	return { service, catalogs };
};

function collectIds(form: FormData, field: string): string[] {
	return form
		.getAll(field)
		.map((value) => String(value))
		.filter((value) => value.length > 0);
}

function parsePlan(form: FormData): GenerationWork[] {
	const workIndices = new Set<number>();
	for (const key of form.keys()) {
		const match = /^workItemId_(\d+)$/.exec(key);
		if (match) workIndices.add(Number(match[1]));
	}

	return [...workIndices]
		.sort((a, b) => a - b)
		.map((index) => {
			const elements: GenerationElement[] = [];
			for (const key of form.keys()) {
				const match = new RegExp(`^elItemId_${index}_(\\d+)$`).exec(key);
				if (!match) continue;
				const elementIndex = match[1];
				elements.push({
					catalogItemId: String(form.get(`elItemId_${index}_${elementIndex}`) ?? '') || null,
					name: String(form.get(`elName_${index}_${elementIndex}`) ?? ''),
					include: form.get(`elInc_${index}_${elementIndex}`) === 'true'
				});
			}
			return {
				catalogItemId: String(form.get(`workItemId_${index}`) ?? '') || null,
				name: String(form.get(`workName_${index}`) ?? ''),
				include: form.get(`workInc_${index}`) === 'true',
				elements
			} satisfies GenerationWork;
		});
}

export const actions: Actions = {
	preview: async (event) => {
		requireAdmin(event.locals);
		const serviceId = requireUuidParam(event.params.serviceId, 'Servicio');
		const form = await event.request.formData();

		try {
			const plan = await planGeneration(getDatabase().db, {
				serviceId,
				workItemIds: collectIds(form, 'workItemIds'),
				elementItemIds: collectIds(form, 'elementItemIds')
			});
			return { plan };
		} catch (error) {
			return failFrom(error);
		}
	},

	apply: async (event) => {
		const admin = requireAdmin(event.locals);
		const serviceId = requireUuidParam(event.params.serviceId, 'Servicio');
		const form = await event.request.formData();

		try {
			await applyGeneration(getDatabase().db, {
				serviceId,
				works: parsePlan(form),
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		throw redirect(303, `/services/${serviceId}`);
	}
};
