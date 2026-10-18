import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import {
	dashboardSummary,
	listAttentionWorks,
	listContractPulse,
	listRecentDecisions,
	listRecentEvidencePhotos,
	listServicePulse,
	reviewTrend
} from '#lib/server/domain/dashboard';
import { listPendingReviews } from '#lib/server/domain/submissions';
import type { PageServerLoad } from './$types';

/** Tablero por rol (docs/producto/experiencia.md). Todo acotado por el ámbito del usuario. */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const db = getDatabase().db;

	const [summary, recentPhotos] = await Promise.all([
		dashboardSummary(db, user),
		listRecentEvidencePhotos(db, user, 6)
	]);
	// Los supervisores no capturan (su tablero es la cola de revisión) y el
	// administrador tiene un resumen global: «atención» es solo del técnico.
	const attention = user.role === 'technician' ? await listAttentionWorks(db, user) : [];
	const pending =
		user.role === 'technician'
			? { items: [], total: 0 }
			: await listPendingReviews(db, user, { limit: 5, sort: 'oldest' });
	const [contractPulse, servicePulse, recentDecisions, trend] = await Promise.all([
		user.role === 'admin' ? listContractPulse(db, 6) : Promise.resolve([]),
		user.role === 'supervisor' ? listServicePulse(db, user, 6) : Promise.resolve([]),
		user.role === 'technician' ? Promise.resolve([]) : listRecentDecisions(db, user, 6),
		user.role === 'technician' ? Promise.resolve([]) : reviewTrend(db, user, 30)
	]);

	return {
		title: `Hola, ${user.displayName}`,
		summary,
		recentPhotos,
		attention,
		pending: pending.items,
		pendingTotal: pending.total,
		contractPulse,
		servicePulse,
		recentDecisions,
		trend
	};
};
