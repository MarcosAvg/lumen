import { errorResponse } from '#lib/server/api';
import { requireExportZip, requireServiceAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getWorkArchive } from '#lib/server/domain/exports';
import { buildZipResponse } from '#lib/server/exports/zip';
import { buildWorkbook } from '#lib/server/exports/workbook';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * ZIP del trabajo: `Trabajo/(Elemento)/Requisito/` con la última entrega
 * aprobada por objetivo + XLSX de registro. Admin y supervisores asignados al
 * servicio.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.workId)) return new Response('No encontrado', { status: 404 });

	try {
		requireExportZip(locals);
		const archive = await getWorkArchive(getDatabase().db, params.workId);
		// Revalida el ámbito al descargar (404 opaco si el servicio queda fuera).
		await requireServiceAccess(locals, archive.serviceId);
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
