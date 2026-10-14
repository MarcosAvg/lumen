import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireCapture, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { removePhoto } from '#lib/server/domain/photos';
import { isUuid } from '#lib/server/params';
import type { RequestHandler } from './$types';

/** Retira (soft removal) una fotografía de la evidencia vigente. */
export const DELETE: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.targetId) || !isUuid(params.photoId)) {
		return json({ message: 'Fotografía inválida.' }, { status: 400 });
	}

	const user = requireUser(locals);

	const body = (await request.json().catch(() => ({}))) as { version?: unknown };
	const version = Number(body.version);
	if (!Number.isInteger(version) || version < 0) {
		return json({ message: 'Falta la versión de evidencia.' }, { status: 400 });
	}

	try {
		await requireCapture(locals, params.targetId);
		const result = await removePhoto(getDatabase().db, {
			targetId: params.targetId,
			photoId: params.photoId,
			expectedVersion: version,
			userId: user.id
		});
		return json(result);
	} catch (error) {
		return errorResponse(error);
	}
};
