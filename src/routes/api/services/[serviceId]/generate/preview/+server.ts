import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { planGeneration } from '#lib/server/domain/works';
import { isUuid } from '#lib/server/params';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
	workItemIds: z.array(z.uuid()).default([]),
	elementItemIds: z.array(z.uuid()).default([])
});

/** Previsualiza la estructura propuesta a partir de ítems de catálogo (admin). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.serviceId)) return json({ message: 'Servicio inválido.' }, { status: 400 });
	requireAdmin(locals);

	const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) return json({ message: 'Selección inválida.' }, { status: 400 });

	try {
		const plan = await planGeneration(getDatabase().db, {
			serviceId: params.serviceId,
			workItemIds: parsed.data.workItemIds,
			elementItemIds: parsed.data.elementItemIds
		});
		return json(plan);
	} catch (error) {
		return errorResponse(error);
	}
};
