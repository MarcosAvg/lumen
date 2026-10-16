import { errorResponse } from '#lib/server/api';
import { requireExportZip, requireServiceAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getWorkArchive } from '#lib/server/domain/exports';
import { buildExportExtras } from '#lib/server/exports/bundle';
import { parseExportRequest } from '#lib/server/exports/options';
import { buildZipResponse } from '#lib/server/exports/zip';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * ZIP del trabajo: `Trabajo/(Elemento)/Requisito/` con la última entrega
 * aprobada por objetivo + registro XLSX y PDF de evidencia. Admin y supervisores
 * asignados al servicio. Opciones: `?variant=&xlsx=&photos=&pdf=` (0/1).
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!isUuid(params.workId)) return new Response('No encontrado', { status: 404 });

	try {
		requireExportZip(locals);
		const db = getDatabase().db;
		const options = parseExportRequest(url);
		const archive = await getWorkArchive(db, params.workId, {
			aggregates: options.variant === 'extended',
			photos: options.photos
		});
		// Revalida el ámbito al descargar (404 opaco si el servicio queda fuera).
		await requireServiceAccess(locals, archive.serviceId);
		const extras = await buildExportExtras(db, storage, archive.plan, options);
		return buildZipResponse(
			{
				fileName: archive.fileName,
				files: options.photos ? archive.files : [],
				extra: extras
			},
			storage
		);
	} catch (error) {
		return errorResponse(error);
	}
};
