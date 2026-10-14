import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireCapture, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { submitEvidence } from '#lib/server/domain/submissions';
import { isUuid } from '#lib/server/params';
import type { RequestHandler } from './$types';

/** Envía la evidencia vigente a revisión como instantánea inmutable. */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.targetId)) {
		return json({ message: 'Evidencia inválida.' }, { status: 400 });
	}
	const user = requireUser(locals);

	const body = (await request.json().catch(() => ({}))) as { version?: unknown };
	const version = Number(body.version);
	if (!Number.isInteger(version) || version < 0) {
		return json({ message: 'Falta la versión de evidencia.' }, { status: 400 });
	}

	try {
		await requireCapture(locals, params.targetId);
		const result = await submitEvidence(getDatabase().db, {
			targetId: params.targetId,
			expectedVersion: version,
			userId: user.id
		});
		return json(result, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
};
