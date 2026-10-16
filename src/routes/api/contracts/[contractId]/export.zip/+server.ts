import { errorResponse } from '#lib/server/api';
import { requireContractAccess, requireExportZip } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getContractArchive } from '#lib/server/domain/exports';
import { buildExportExtras } from '#lib/server/exports/bundle';
import { parseExportRequest } from '#lib/server/exports/options';
import { buildZipResponse } from '#lib/server/exports/zip';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * ZIP del contrato: `Contrato/Edificio/Servicio/Trabajo/(Elemento)/Requisito/`
 * con la última entrega aprobada por objetivo, más el registro XLSX y los PDF de
 * evidencia por trabajo. Solo admin y supervisores del contrato (los técnicos no
 * exportan). Opciones: `?variant=&xlsx=&photos=&pdf=` (0/1).
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!isUuid(params.contractId)) return new Response('No encontrado', { status: 404 });

	try {
		requireExportZip(locals);
		// 404 opaco si el contrato queda fuera del ámbito del usuario.
		await requireContractAccess(locals, params.contractId);
		const db = getDatabase().db;
		const options = parseExportRequest(url);
		const archive = await getContractArchive(db, params.contractId, {
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
