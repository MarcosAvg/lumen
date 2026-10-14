import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireCapture, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { reorderPhotos } from '#lib/server/domain/photos';
import { isUuid } from '#lib/server/params';
import type { RequestHandler } from './$types';

interface OrderBody {
	requirementId?: unknown;
	orderedIds?: unknown;
	version?: unknown;
}

/** Reordena las fotografías dentro de un grupo (requisito o Adicionales). */
export const PUT: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.targetId)) {
		return json({ message: 'Evidencia inválida.' }, { status: 400 });
	}

	const user = requireUser(locals);
	const body = (await request.json().catch(() => ({}))) as OrderBody;

	const requirementId =
		typeof body.requirementId === 'string' && body.requirementId.length > 0
			? body.requirementId
			: null;
	if (requirementId && !isUuid(requirementId)) {
		return json({ message: 'Requisito inválido.' }, { status: 400 });
	}

	const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds : null;
	if (
		!orderedIds ||
		!orderedIds.every((id): id is string => typeof id === 'string' && isUuid(id))
	) {
		return json({ message: 'Lista de fotografías inválida.' }, { status: 400 });
	}

	const version = Number(body.version);
	if (!Number.isInteger(version) || version < 0) {
		return json({ message: 'Falta la versión de evidencia.' }, { status: 400 });
	}

	try {
		await requireCapture(locals, params.targetId);
		const result = await reorderPhotos(getDatabase().db, {
			targetId: params.targetId,
			requirementId,
			orderedIds,
			expectedVersion: version,
			userId: user.id
		});
		return json(result);
	} catch (error) {
		return errorResponse(error);
	}
};
