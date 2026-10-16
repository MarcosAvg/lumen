import { errorResponse } from '#lib/server/api';
import { requireContractAccess, requireExportZip } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getContractArchive } from '#lib/server/domain/exports';
import { parseExportRequest } from '#lib/server/exports/options';
import { buildZipResponse } from '#lib/server/exports/zip';
import { buildWorkbook } from '#lib/server/exports/workbook';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * ZIP del contrato: `Contrato/Edificio/Servicio/Trabajo/(Elemento)/Requisito/`
 * con la última entrega aprobada por objetivo, más el XLSX de registro en la
 * raíz del contrato. Solo admin y supervisores del contrato (los técnicos no
 * exportan). Opciones: `?variant=simple|extended&xlsx=0|1&photos=0|1`.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!isUuid(params.contractId)) return new Response('No encontrado', { status: 404 });

	try {
		requireExportZip(locals);
		// 404 opaco si el contrato queda fuera del ámbito del usuario.
		await requireContractAccess(locals, params.contractId);
		const options = parseExportRequest(url);
		const archive = await getContractArchive(getDatabase().db, params.contractId, {
			aggregates: options.variant === 'extended'
		});
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
