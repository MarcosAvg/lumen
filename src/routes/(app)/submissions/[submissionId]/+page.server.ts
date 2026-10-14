import { fail } from '@sveltejs/kit';
import { requireReview, requireServiceAccess, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import {
	getSubmissionContext,
	getSubmissionDetail,
	reviewSubmission
} from '#lib/server/domain/submissions';
import { failFrom, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import { reviewSchema } from '#lib/schemas/submissions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const submissionId = requireUuidParam(params.submissionId, 'Entrega');
	const user = requireUser(locals);
	const db = getDatabase().db;

	const detail = await getSubmissionDetail(db, submissionId);
	const { access } = await requireServiceAccess(locals, detail.context.serviceId);
	const context = await getSubmissionContext(db, submissionId);

	const pending = context.status === 'in_review';
	const canReview = pending && (user.role === 'admin' || access === 'supervisor');

	return { detail, pending, canReview };
};

export const actions: Actions = {
	approve: async (event) => {
		const submissionId = requireUuidParam(event.params.submissionId, 'Entrega');
		await requireReview(event.locals, submissionId);
		const reviewer = requireUser(event.locals);

		try {
			await reviewSubmission(getDatabase().db, {
				submissionId,
				decision: 'approved',
				reason: null,
				reviewerId: reviewer.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Entrega aprobada. La evidencia quedó bloqueada.' };
	},

	reject: async (event) => {
		const submissionId = requireUuidParam(event.params.submissionId, 'Entrega');
		const parsed = parseForm(reviewSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { rejectErrors: parsed.errors });

		await requireReview(event.locals, submissionId);
		const reviewer = requireUser(event.locals);

		try {
			await reviewSubmission(getDatabase().db, {
				submissionId,
				decision: 'rejected',
				reason: parsed.data.reason,
				reviewerId: reviewer.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Entrega rechazada. Los técnicos pueden corregir y reenviar.' };
	}
};
