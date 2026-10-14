import { json } from '@sveltejs/kit';
import { errorResponse } from '#lib/server/api';
import { requireReview, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { reviewSubmission } from '#lib/server/domain/submissions';
import { isUuid } from '#lib/server/params';
import type { RequestHandler } from './$types';

/** Aprueba o rechaza una entrega (el rechazo exige motivo no vacío). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.submissionId)) {
		return json({ message: 'Entrega inválida.' }, { status: 400 });
	}

	const body = (await request.json().catch(() => ({}))) as { decision?: unknown; reason?: unknown };
	const decision =
		body.decision === 'approved' || body.decision === 'rejected' ? body.decision : null;
	if (!decision) {
		return json({ message: 'Decisión inválida.' }, { status: 400 });
	}
	const reason = typeof body.reason === 'string' ? body.reason : null;

	try {
		await requireReview(locals, params.submissionId);
		const reviewer = requireUser(locals);
		const result = await reviewSubmission(getDatabase().db, {
			submissionId: params.submissionId,
			decision,
			reason,
			reviewerId: reviewer.id
		});
		return json(result);
	} catch (error) {
		return errorResponse(error);
	}
};
