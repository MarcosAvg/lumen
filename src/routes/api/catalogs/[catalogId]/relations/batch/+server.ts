import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { createRelationsBatch } from '#lib/server/domain/catalogs';
import { isUuid } from '#lib/server/params';
import { createRelationsBatchSchema } from '#lib/schemas/catalogs';
import type { RequestHandler } from './$types';

/** Relaciona en lote ítems de catálogos distintos (admin). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.catalogId)) return json({ message: 'Catálogo inválido.' }, { status: 400 });
	const admin = requireAdmin(locals);

	const parsed = createRelationsBatchSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) return json({ message: 'Selección inválida.' }, { status: 400 });

	try {
		const result = await createRelationsBatch(getDatabase().db, {
			fromItemIds: parsed.data.fromItemIds,
			toItemIds: parsed.data.toItemIds,
			relationType: parsed.data.relationType,
			actorId: admin.id
		});
		return json(result);
	} catch (error) {
		return errorResponse(error);
	}
};
