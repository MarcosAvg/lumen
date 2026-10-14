import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { getServicesCsv } from '#lib/server/domain/exports';
import { contentDisposition } from '#lib/server/exports/zip';
import { isUuid } from '#lib/server/params';
import type { TargetStatus } from '#lib/types';
import type { RequestHandler } from './$types';

const STATUSES: TargetStatus[] = ['pending', 'in_progress', 'in_review', 'rejected', 'approved'];

/** CSV administrativo (solo admin): una fila por trabajo directo o elemento, sin fotos. */
export const GET: RequestHandler = async ({ locals, url }) => {
	requireAdmin(locals);

	const rawService = url.searchParams.get('serviceId');
	const serviceId = rawService && isUuid(rawService) ? rawService : null;
	const rawStatus = url.searchParams.get('status');
	const status =
		rawStatus && (STATUSES as string[]).includes(rawStatus) ? (rawStatus as TargetStatus) : null;

	const csv = await getServicesCsv(getDatabase().db, { serviceId, status });
	return new Response(csv.content, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': contentDisposition(csv.fileName),
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
