import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { reorderRequirements } from '#lib/server/domain/requirements';
import { isUuid } from '#lib/server/params';
import type { RequestHandler } from './$types';

/** Reordena los requisitos de un objetivo (solo antes del primer envío). */
export const PUT: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.targetId)) {
		return json({ message: 'Evidencia inválida.' }, { status: 400 });
	}
	const admin = requireAdmin(locals);

	const body = (await request.json().catch(() => ({}))) as { orderedIds?: unknown };
	const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds : null;
	if (
		!orderedIds ||
		!orderedIds.every((id): id is string => typeof id === 'string' && isUuid(id))
	) {
		return json({ message: 'Lista de requisitos inválida.' }, { status: 400 });
	}

	try {
		await reorderRequirements(getDatabase().db, {
			targetId: params.targetId,
			orderedIds,
			actorId: admin.id
		});
		return json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
};
