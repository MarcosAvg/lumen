import { readFile } from 'node:fs/promises';
import { errorResponse } from '#lib/server/api';
import { requireContractAccess } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getContractPdfContext } from '#lib/server/domain/contracts';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/** Fondo de PDF del contrato (imagen PNG). Accesible a los miembros del contrato. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.contractId)) return new Response('No encontrado', { status: 404 });

	try {
		await requireContractAccess(locals, params.contractId);
		const context = await getContractPdfContext(getDatabase().db, params.contractId);
		if (!context.backgroundPath) return new Response('Sin fondo', { status: 404 });
		const bytes = await readFile(storage.absolute(context.backgroundPath));
		return new Response(bytes, {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		return errorResponse(error);
	}
};
