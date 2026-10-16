import { errorResponse } from '#lib/server/api';
import { requireExportZip, requireServiceAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getServiceArchive } from '#lib/server/domain/exports';
import { buildExportExtras } from '#lib/server/exports/bundle';
import { parseExportRequest } from '#lib/server/exports/options';
import { buildZipResponse } from '#lib/server/exports/zip';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * ZIP del servicio: última entrega aprobada por objetivo + registro XLSX y PDF
 * por trabajo. Opciones: `?variant=&xlsx=&photos=&pdf=` (0/1).
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!isUuid(params.serviceId)) return new Response('No encontrado', { status: 404 });

	try {
		// Los técnicos no exportan (403 antes de tocar el recurso).
		requireExportZip(locals);
		await requireServiceAccess(locals, params.serviceId);
		const db = getDatabase().db;
		const options = parseExportRequest(url);
		const archive = await getServiceArchive(db, params.serviceId, {
			aggregates: options.variant === 'extended',
			photos: options.photos
		});
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
