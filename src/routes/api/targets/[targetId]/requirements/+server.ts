import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { createRequirement } from '#lib/server/domain/requirements';
import { isUuid } from '#lib/server/params';
import type { RequestHandler } from './$types';

/** Crea un requisito fotográfico en un objetivo (solo administradores). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.targetId)) {
		return json({ message: 'Evidencia inválida.' }, { status: 400 });
	}
	const admin = requireAdmin(locals);

	const body = (await request.json().catch(() => ({}))) as { name?: unknown; isRequired?: unknown };
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (!name || name.length > 120) {
		return json({ message: 'El nombre del requisito es obligatorio (máx. 120).' }, { status: 400 });
	}
	const isRequired = body.isRequired === undefined ? true : Boolean(body.isRequired);

	try {
		const result = await createRequirement(getDatabase().db, {
			targetId: params.targetId,
			name,
			isRequired,
			actorId: admin.id
		});
		return json(result, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
};
