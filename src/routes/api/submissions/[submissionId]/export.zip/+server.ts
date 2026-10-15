import { errorResponse } from '#lib/server/api';
import { requireExportZip, requireServiceAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getSubmissionArchive } from '#lib/server/domain/exports';
import { buildZipResponse } from '#lib/server/exports/zip';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/** ZIP de una entrega desde su snapshot inmutable (fotos, grupos y orden). */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.submissionId)) return new Response('No encontrada', { status: 404 });

	try {
		// Los técnicos no exportan (403 antes de tocar el recurso).
		requireExportZip(locals);
		const archive = await getSubmissionArchive(getDatabase().db, params.submissionId);
		// Revalida el ámbito al descargar (404 opaco si el servicio queda fuera).
		await requireServiceAccess(locals, archive.serviceId);
		return buildZipResponse({ fileName: archive.fileName, files: archive.files }, storage);
	} catch (error) {
		return errorResponse(error);
	}
};
