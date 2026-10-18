import { errorResponse } from '#lib/server/api';
import { requireExportZip, requireServiceAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { buildExportPlan } from '#lib/server/domain/exports';
import { buildServicePdfForPlan } from '#lib/server/exports/bundle';
import { contentDisposition } from '#lib/server/exports/zip';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * PDF recopilado de un servicio: portada y una sección por trabajo con
 * evidencia aprobada. Solo admin y supervisores asignados.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.serviceId)) return new Response('No encontrado', { status: 404 });

	try {
		requireExportZip(locals);
		await requireServiceAccess(locals, params.serviceId);
		const db = getDatabase().db;
		const plan = await buildExportPlan(
			db,
			{ kind: 'service', serviceId: params.serviceId },
			{ aggregates: false, photos: true }
		);
		const pdf = await buildServicePdfForPlan(db, storage, plan);
		return new Response(new Uint8Array(pdf.content), {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': contentDisposition(pdf.fileName),
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		return errorResponse(error);
	}
};
