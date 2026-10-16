import { errorResponse } from '#lib/server/api';
import { requireExportZip, requireServiceAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getServiceArchive } from '#lib/server/domain/exports';
import { buildZipResponse } from '#lib/server/exports/zip';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/** ZIP del servicio: solo la última entrega aprobada por objetivo. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.serviceId)) return new Response('No encontrado', { status: 404 });

	try {
		// Los técnicos no exportan (403 antes de tocar el recurso).
		requireExportZip(locals);
		await requireServiceAccess(locals, params.serviceId);
		const archive = await getServiceArchive(getDatabase().db, params.serviceId);
		return buildZipResponse({ fileName: archive.fileName, files: archive.files }, storage);
	} catch (error) {
		return errorResponse(error);
	}
};
