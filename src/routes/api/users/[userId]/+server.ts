import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { deleteUser, getUserImpact } from '#lib/server/domain/users';
import { orHttp } from '#lib/server/http';
import { isUuid } from '#lib/server/params';
import type { RequestHandler } from './$types';

/** Resumen de impacto antes de eliminar un usuario (solo admin). */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.userId)) return json({ message: 'Usuario inválido.' }, { status: 400 });
	requireAdmin(locals);
	const db = getDatabase().db;
	const impact = await orHttp(getUserImpact(db, params.userId));
	return json({ impact });
};

/** Elimina una cuenta conservando su firma histórica (solo admin). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.userId)) return json({ message: 'Usuario inválido.' }, { status: 400 });
	const admin = requireAdmin(locals);

	try {
		await deleteUser(getDatabase().db, { userId: params.userId, actorId: admin.id });
		return json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
};
