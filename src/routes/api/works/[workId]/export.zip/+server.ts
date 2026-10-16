import { errorResponse } from '#lib/server/api';
import { requireExportZip, requireServiceAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getWorkArchive } from '#lib/server/domain/exports';
import { parseExportRequest } from '#lib/server/exports/options';
import { buildZipResponse } from '#lib/server/exports/zip';
import { buildWorkbook } from '#lib/server/exports/workbook';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * ZIP del trabajo: `Trabajo/(Elemento)/Requisito/` con la última entrega
 * aprobada por objetivo + XLSX de registro. Admin y supervisores asignados al
 * servicio. Opciones: `?variant=simple|extended&xlsx=0|1&photos=0|1`.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!isUuid(params.workId)) return new Response('No encontrado', { status: 404 });

	try {
		requireExportZip(locals);
		const options = parseExportRequest(url);
		const archive = await getWorkArchive(getDatabase().db, params.workId, {
			aggregates: options.variant === 'extended'
		});
		// Revalida el ámbito al descargar (404 opaco si el servicio queda fuera).
		await requireServiceAccess(locals, archive.serviceId);
		const extra = options.xlsx
			? [
					{
						name: `${archive.plan.root}/${archive.plan.root}.xlsx`,
						content: await buildWorkbook(archive.plan, options.variant)
					}
				]
			: [];
		return buildZipResponse(
			{
				fileName: archive.fileName,
				files: options.photos ? archive.files : [],
				extra
			},
			storage
		);
	} catch (error) {
		return errorResponse(error);
	}
};
