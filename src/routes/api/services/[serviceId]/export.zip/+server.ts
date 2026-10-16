import { errorResponse } from '#lib/server/api';
import { requireExportZip, requireServiceAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getServiceArchive } from '#lib/server/domain/exports';
import { buildZipResponse } from '#lib/server/exports/zip';
import { buildWorkbook } from '#lib/server/exports/workbook';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/** ZIP del servicio: última entrega aprobada por objetivo + XLSX de registro. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.serviceId)) return new Response('No encontrado', { status: 404 });

	try {
		// Los técnicos no exportan (403 antes de tocar el recurso).
		requireExportZip(locals);
		await requireServiceAccess(locals, params.serviceId);
		const archive = await getServiceArchive(getDatabase().db, params.serviceId);
		const workbook = await buildWorkbook(archive.plan);
		return buildZipResponse(
			{
				fileName: archive.fileName,
				files: archive.files,
				extra: [{ name: `${archive.plan.root}/${archive.plan.root}.xlsx`, content: workbook }]
			},
			storage
		);
	} catch (error) {
		return errorResponse(error);
	}
};
