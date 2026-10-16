import { errorResponse } from '#lib/server/api';
import { requireContractAccess, requireExportZip } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getContractArchive } from '#lib/server/domain/exports';
import { buildZipResponse } from '#lib/server/exports/zip';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * ZIP del contrato: `Contrato/Edificio/Servicio/Trabajo/(Elemento)/Requisito/`
 * con la última entrega aprobada por objetivo. Solo admin y supervisores del
 * contrato (los técnicos no exportan).
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.contractId)) return new Response('No encontrado', { status: 404 });

	try {
		requireExportZip(locals);
		// 404 opaco si el contrato queda fuera del ámbito del usuario.
		await requireContractAccess(locals, params.contractId);
		const archive = await getContractArchive(getDatabase().db, params.contractId);
		return buildZipResponse({ fileName: archive.fileName, files: archive.files }, storage);
	} catch (error) {
		return errorResponse(error);
	}
};
