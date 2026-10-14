import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { createRequirement } from '#lib/server/domain/requirements';
import { isUuid } from '#lib/server/params';
import { createRequirementBodySchema } from '#lib/schemas/requirements';
import type { RequestHandler } from './$types';

/** Crea un requisito fotográfico en un objetivo (solo administradores). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.targetId)) {
		return json({ message: 'Evidencia inválida.' }, { status: 400 });
	}
	const admin = requireAdmin(locals);

	const parsed = createRequirementBodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ message: 'Datos del requisito inválidos.' }, { status: 400 });
	}

	try {
		const result = await createRequirement(getDatabase().db, {
			targetId: params.targetId,
			catalogItemId: parsed.data.catalogItemId ?? null,
			name: parsed.data.name ?? null,
			isRequired: parsed.data.isRequired,
			actorId: admin.id
		});
		return json(result, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
};
