import { requireServiceAccess, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { orHttp } from '#lib/server/http';
import { listCatalogsWithItems } from '#lib/server/domain/catalogs';
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

	const element = await orHttp(getElementDetail(db, elementId));
	const { service } = await requireServiceAccess(locals, element.serviceId);
	const serviceActive = service.lifecycle === 'active';

	const target = await orHttp(getTargetForElement(db, elementId));
	const [evidence, history, rejection, catalogs] = await Promise.all([
		loadEvidence(db, target.id),
		getHistory(db, target.id),
		getLatestRejection(db, target.id),
		// Solo se usan para el selector de requisitos.
		user.role === 'admin' ? listCatalogsWithItems(db) : Promise.resolve([])
	]);

	return {
		title: element.name,
		back: { href: `/works/${element.workId}`, label: element.workName },
		element,
		evidence,
		history,
		rejection,
		catalogs,
		serviceLifecycle: service.lifecycle,
		editable: serviceActive && isEditableStatus(target.status),
		isAdmin: user.role === 'admin'
	};
};
