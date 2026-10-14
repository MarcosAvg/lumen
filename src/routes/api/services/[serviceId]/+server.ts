import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { deleteService, getServiceImpact } from '#lib/server/domain/structure';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import { removeUnreferencedFiles } from '#lib/server/storage/orphans';
import type { RequestHandler } from './$types';

/** Resumen de impacto antes de borrar (solo admin). */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.serviceId)) {
		return json({ message: 'Servicio inválido.' }, { status: 400 });
	}
	requireAdmin(locals);
	const impact = await getServiceImpact(getDatabase().db, params.serviceId);
	if (!impact) return json({ message: 'Servicio no encontrado.' }, { status: 404 });
	return json({ impact });
};

/** Elimina un servicio con toda su estructura y evidencia (destructivo, solo admin). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.serviceId)) {
		return json({ message: 'Servicio inválido.' }, { status: 400 });
	}
	const admin = requireAdmin(locals);
	const db = getDatabase().db;

	try {
		const result = await deleteService(db, { serviceId: params.serviceId, actorId: admin.id });
		const filesRemoved = await removeUnreferencedFiles(db, storage, result.orphanedPaths).catch(
			(error) => {
				console.error('[servicio] limpieza diferida falló', error);
				return 0;
			}
		);
		return json({
			ok: true,
			removed: {
				targets: result.targets,
				submissions: result.submissions,
				photos: result.photos,
				files: filesRemoved
			}
		});
	} catch (error) {
		return errorResponse(error);
	}
};
