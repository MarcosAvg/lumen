import { requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { dashboardSummary, listAttentionWorks } from '#lib/server/domain/dashboard';
import { listPendingReviews } from '#lib/server/domain/submissions';
import type { PageServerLoad } from './$types';

/** Tablero por rol (docs/05 §4). Todo acotado por el ámbito del usuario. */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const db = getDatabase().db;

	const summary = await dashboardSummary(db, user);
	// Los supervisores no capturan (su tablero es la cola de revisión) y el
	// administrador tiene un resumen global: «atención» es solo del técnico.
	const attention = user.role === 'technician' ? await listAttentionWorks(db, user) : [];
	const pending =
		user.role === 'technician'
			? { items: [], total: 0 }
			: await listPendingReviews(db, user, { limit: 5 });

	return {
		title: `Hola, ${user.displayName}`,
		summary,
		attention,
		pending: pending.items,
		pendingTotal: pending.total
	};
};
