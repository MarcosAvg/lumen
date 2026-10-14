import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { deleteRequirement, updateRequirement } from '#lib/server/domain/requirements';
import { isUuid } from '#lib/server/params';
import { updateRequirementBodySchema } from '#lib/schemas/requirements';
import type { RequestHandler } from './$types';

/** Renombra/cambia obligatoriedad de un requisito. */
export const PATCH: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.targetId) || !isUuid(params.requirementId)) {
		return json({ message: 'Requisito inválido.' }, { status: 400 });
	}
	const admin = requireAdmin(locals);

	const parsed = updateRequirementBodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ message: 'Datos del requisito inválidos.' }, { status: 400 });
	}

	try {
		await updateRequirement(getDatabase().db, {
			requirementId: params.requirementId,
			name: parsed.data.name,
			isRequired: parsed.data.isRequired,
			actorId: admin.id
		});
		return json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
};

/** Elimina un requisito antes del primer envío (sus fotos pasan a Adicionales). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.targetId) || !isUuid(params.requirementId)) {
		return json({ message: 'Requisito inválido.' }, { status: 400 });
	}
	const admin = requireAdmin(locals);

	try {
		await deleteRequirement(getDatabase().db, {
			requirementId: params.requirementId,
			actorId: admin.id
		});
		return json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
};
