import { error, json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getOfflineSnapshot } from '#lib/server/domain/offline';
import type { RequestHandler } from './$types';

/**
 * Snapshot de solo lectura para el modo consulta offline. No se cachea en el
 * service worker: se guarda en IndexedDB, separado por usuario y con caducidad.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	if (user.role === 'admin') {
		throw error(403, 'El modo offline no está disponible para administración.');
	}

	const snapshot = await getOfflineSnapshot(getDatabase().db, user);
	return json(snapshot, {
		headers: {
			'Cache-Control': 'private, no-store'
		}
	});
};
