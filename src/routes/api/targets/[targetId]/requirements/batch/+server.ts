import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { createRequirementsBatch } from '#lib/server/domain/requirements';
import { isUuid } from '#lib/server/params';
import { createRequirementsBatchSchema } from '#lib/schemas/requirements';
import type { RequestHandler } from './$types';

/** Añade varios requisitos desde un catálogo de requisitos (admin). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.targetId)) {
		return json({ message: 'Evidencia inválida.' }, { status: 400 });
	}
	const admin = requireAdmin(locals);

	const parsed = createRequirementsBatchSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ message: 'Selección inválida.' }, { status: 400 });
	}

	try {
		const result = await createRequirementsBatch(getDatabase().db, {
			targetId: params.targetId,
			catalogItemIds: parsed.data.catalogItemIds,
			isRequired: parsed.data.isRequired,
			actorId: admin.id
		});
		return json(result, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
};
