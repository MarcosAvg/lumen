import { requireServiceAccess, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { loadEvidence } from '#lib/server/domain/photos';
import { getHistory, getLatestRejection } from '#lib/server/domain/submissions';
import { getTargetForElement, isEditableStatus } from '#lib/server/domain/targets';
import { getElementDetail } from '#lib/server/domain/works';
import { requireUuidParam } from '#lib/server/params';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const elementId = requireUuidParam(params.elementId, 'Elemento');
	const user = requireUser(locals);
	const db = getDatabase().db;

	const element = await getElementDetail(db, elementId);
	await requireServiceAccess(locals, element.serviceId);

	const target = await getTargetForElement(db, elementId);
	const [evidence, history, rejection] = await Promise.all([
		loadEvidence(db, target.id),
		getHistory(db, target.id),
		getLatestRejection(db, target.id)
	]);

	return {
		element,
		evidence,
		history,
		rejection,
		editable: isEditableStatus(target.status),
		isAdmin: user.role === 'admin'
	};
};
