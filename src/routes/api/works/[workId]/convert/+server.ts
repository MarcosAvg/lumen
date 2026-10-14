import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { convertWorkMode } from '#lib/server/domain/structure';
import { fieldErrors } from '#lib/server/forms';
import { isUuid } from '#lib/server/params';
import { convertWorkModeSchema } from '#lib/schemas/works';
import type { RequestHandler } from './$types';

/**
 * Convierte un trabajo `direct ↔ divided`. Solo se permite si no existe ninguna
 * entrega previa y el cliente reasigna todos los requisitos y fotos.
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.workId)) {
		return json({ message: 'Trabajo inválido.' }, { status: 400 });
	}
	const admin = requireAdmin(locals);

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const parsed = convertWorkModeSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ message: 'Datos de conversión inválidos.', details: fieldErrors(parsed.error) },
			{ status: 400 }
		);
	}

	const workId = params.workId;
	try {
		const result =
			parsed.data.targetMode === 'divided'
				? await convertWorkMode(getDatabase().db, {
						workId,
						targetMode: 'divided',
						actorId: admin.id,
						elements: parsed.data.elements,
						requirements: parsed.data.requirements,
						additionalPhotos: parsed.data.additionalPhotos
					})
				: await convertWorkMode(getDatabase().db, {
						workId,
						targetMode: 'direct',
						actorId: admin.id,
						requirements: parsed.data.requirements,
						additionalPhotos: parsed.data.additionalPhotos
					});
		return json({ ok: true, ...result });
	} catch (error) {
		return errorResponse(error);
	}
};
