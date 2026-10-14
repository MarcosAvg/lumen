import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { deleteRelation } from '#lib/server/domain/catalogs';
import { isUuid } from '#lib/server/params';
import type { RequestHandler } from './$types';

/** Elimina una relación entre ítems de catálogo (admin). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.catalogId)) return json({ message: 'Catálogo inválido.' }, { status: 400 });
	if (!isUuid(params.relationId)) return json({ message: 'Relación inválida.' }, { status: 400 });
	const admin = requireAdmin(locals);

	try {
		await deleteRelation(getDatabase().db, params.relationId, admin.id);
		return json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
};
