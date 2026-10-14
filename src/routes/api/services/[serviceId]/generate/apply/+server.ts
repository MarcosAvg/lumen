import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { applyGeneration } from '#lib/server/domain/works';
import { isUuid } from '#lib/server/params';
import { requirementDraftSchema } from '#lib/schemas/requirements';
import type { RequestHandler } from './$types';

const elementSchema = z.object({
	catalogItemId: z.union([z.uuid(), z.null()]).optional().default(null),
	name: z.string().default(''),
	include: z.boolean().default(true)
});
const workSchema = z.object({
	catalogItemId: z.union([z.uuid(), z.null()]).optional().default(null),
	name: z.string().min(1),
	include: z.boolean().default(true),
	elements: z.array(elementSchema).default([])
});
const bodySchema = z.object({
	works: z.array(workSchema).min(1),
	requirements: z.array(requirementDraftSchema).optional().default([]),
	requirementIsRequired: z.boolean().optional().default(true)
});

/** Aplica la estructura planificada (admin). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.serviceId)) return json({ message: 'Servicio inválido.' }, { status: 400 });
	const admin = requireAdmin(locals);

	const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) return json({ message: 'Plan inválido.' }, { status: 400 });

	try {
		const result = await applyGeneration(getDatabase().db, {
			serviceId: params.serviceId,
			works: parsed.data.works,
			requirements: parsed.data.requirements,
			requirementIsRequired: parsed.data.requirementIsRequired,
			actorId: admin.id
		});
		return json(result);
	} catch (error) {
		return errorResponse(error);
	}
};
