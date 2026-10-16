import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import {
	catalogItems,
	contractAssignments,
	elements,
	evidenceSubmissions,
	evidenceTargets,
	reviews,
	serviceAssignments,
	services,
	works
} from '#lib/server/db/schema';
import type { SessionUser, TargetStatus, WorkMode } from '#lib/types';
import { listAllowedServiceIds } from './services';

/**
 * Tablero por rol (docs/05 §4). Todo se calcula dentro del **ámbito** del
 * usuario: administrador (global) o asignación vigente **dentro de un contrato**
 * del que siga siendo miembro. Nunca se expone un total que incluya servicios
 * ajenos.
 */

/** Servicios visibles: `null` = todos (admin); array = asignados vigentes. */
async function visibleServiceIds(db: Database, user: SessionUser): Promise<string[] | null> {
	return listAllowedServiceIds(db, user);
}

export interface AttentionWork {
	workId: string;
	workName: string;
	serviceId: string;
	serviceName: string;
	mode: WorkMode;
	/** Estado del trabajo: el peor de sus objetivos (rechazado > en progreso > pendiente). */
	status: TargetStatus;
	elementTotal: number;
	elementApproved: number;
	elementRejected: number;
	elementPending: number;
	rejectionReason: string | null;
}

const ATTENTION_PRIORITY: Record<string, number> = {
	rejected: 3,
	in_progress: 2,
	pending: 1
};

/**
 * Trabajos con objetivos editables (pendientes, en progreso o rechazados) dentro
 * del ámbito, con los rechazados primero. **Agrupa por trabajo**: un trabajo
 * directo es una fila; un trabajo dividido resume sus elementos. Sin N+1.
 */
export async function listAttentionWorks(
	db: Database,
	user: SessionUser
): Promise<AttentionWork[]> {
	const allowed = await visibleServiceIds(db, user);
	if (allowed && allowed.length === 0) return [];

	const workCatalog = alias(catalogItems, 'work_catalog');
	const parentWork = alias(works, 'parent_work');
	const parentWorkCatalog = alias(catalogItems, 'parent_work_catalog');

	const workIdExpr = sql<string | null>`coalesce(${works.id}, ${parentWork.id})`;
	const modeExpr = sql<string | null>`coalesce(${works.mode}, ${parentWork.mode})`;
	const workNameExpr = sql<
		string | null
	>`coalesce(${workCatalog.name}, ${works.customName}, ${parentWorkCatalog.name}, ${parentWork.customName})`;
	const scopedService = or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId));

	const [attentionRows, totals, rejectionRows] = await Promise.all([
		db
			.select({
				workId: workIdExpr,
				mode: modeExpr,
				workName: workNameExpr,
				serviceId: services.id,
				serviceName: services.name,
				status: evidenceTargets.currentStatus
			})
			.from(evidenceTargets)
			.leftJoin(works, eq(works.id, evidenceTargets.workId))
			.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
			.leftJoin(parentWork, eq(parentWork.id, elements.workId))
			.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
			.leftJoin(parentWorkCatalog, eq(parentWorkCatalog.id, parentWork.catalogItemId))
			.innerJoin(services, scopedService)
			.where(
				and(
					inArray(evidenceTargets.currentStatus, ['pending', 'in_progress', 'rejected']),
					allowed ? inArray(services.id, allowed) : undefined
				)
			),
		workTargetTotals(db, allowed),
		db
			.select({ workId: workIdExpr, reason: reviews.reason })
			.from(reviews)
			.innerJoin(evidenceSubmissions, eq(evidenceSubmissions.id, reviews.submissionId))
			.innerJoin(evidenceTargets, eq(evidenceTargets.id, evidenceSubmissions.targetId))
			.leftJoin(works, eq(works.id, evidenceTargets.workId))
			.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
			.leftJoin(parentWork, eq(parentWork.id, elements.workId))
			.leftJoin(services, scopedService)
			.where(
				and(eq(reviews.decision, 'rejected'), allowed ? inArray(services.id, allowed) : undefined)
			)
			.orderBy(desc(reviews.reviewedAt))
	]);

	if (attentionRows.length === 0) return [];

	const totalsByWork = new Map(totals.map((row) => [row.workId, row]));
	const reasonByWork = new Map<string, string>();
	for (const row of rejectionRows) {
		if (row.workId && row.reason && !reasonByWork.has(row.workId)) {
			reasonByWork.set(row.workId, row.reason);
		}
	}

	const byWork = new Map<string, AttentionWork>();
	for (const row of attentionRows) {
		if (!row.workId) continue;
		const total = totalsByWork.get(row.workId);
		let work = byWork.get(row.workId);
		if (!work) {
			work = {
				workId: row.workId,
				workName: row.workName ?? 'Sin nombre',
				serviceId: row.serviceId,
				serviceName: row.serviceName,
				mode: (row.mode as WorkMode) ?? 'direct',
				status: row.status,
				elementTotal: total?.total ?? 1,
				elementApproved: total?.approved ?? 0,
				elementRejected: 0,
				elementPending: 0,
				rejectionReason: reasonByWork.get(row.workId) ?? null
			};
			byWork.set(row.workId, work);
		}
		if (row.status === 'rejected') work.elementRejected += 1;
		else work.elementPending += 1;
		if ((ATTENTION_PRIORITY[row.status] ?? 0) > (ATTENTION_PRIORITY[work.status] ?? 0)) {
			work.status = row.status;
		}
	}

	return [...byWork.values()].sort(
		(a, b) =>
			(ATTENTION_PRIORITY[b.status] ?? 0) - (ATTENTION_PRIORITY[a.status] ?? 0) ||
			a.workName.localeCompare(b.workName, 'es')
	);
}

interface WorkTotals {
	workId: string;
	total: number;
	approved: number;
}

/** Total y aprobados de objetivos por trabajo (todos los estados). */
async function workTargetTotals(db: Database, allowed: string[] | null): Promise<WorkTotals[]> {
	const parentWork = alias(works, 'parent_work');
	return db
		.select({
			workId: sql<string>`coalesce(${works.id}, ${parentWork.id})`,
			total: sql<number>`cast(count(*) as int)`,
			approved: sql<number>`cast(count(*) filter (where ${evidenceTargets.currentStatus} = 'approved') as int)`
		})
		.from(evidenceTargets)
		.leftJoin(works, eq(works.id, evidenceTargets.workId))
		.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
		.leftJoin(parentWork, eq(parentWork.id, elements.workId))
		.innerJoin(
			services,
			or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId))
		)
		.where(allowed ? inArray(services.id, allowed) : undefined)
		.groupBy(sql`coalesce(${works.id}, ${parentWork.id})`);
}

/** Entregas pendientes de revisión dentro del ámbito (admin/supervisor). */
export async function countPendingReviews(db: Database, user: SessionUser): Promise<number> {
	if (user.role === 'technician') return 0;

	let allowed: string[] | null = null;
	if (user.role !== 'admin') {
		const rows = await db
			.select({ serviceId: services.id })
			.from(services)
			.innerJoin(serviceAssignments, eq(serviceAssignments.serviceId, services.id))
			.innerJoin(
				contractAssignments,
				and(
					eq(contractAssignments.contractId, services.contractId),
					eq(contractAssignments.userId, serviceAssignments.userId),
					eq(contractAssignments.assignmentRole, serviceAssignments.assignmentRole),
					isNull(contractAssignments.revokedAt)
				)
			)
			.where(
				and(
					eq(serviceAssignments.userId, user.id),
					eq(serviceAssignments.assignmentRole, 'supervisor'),
					isNull(serviceAssignments.revokedAt)
				)
			);
		allowed = [...new Set(rows.map((row) => row.serviceId))];
		if (allowed.length === 0) return 0;
	}

	const parentWork = alias(works, 'parent_work');
	const [row] = await db
		.select({ value: sql<number>`cast(count(*) as int)` })
		.from(evidenceTargets)
		.leftJoin(works, eq(works.id, evidenceTargets.workId))
		.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
		.leftJoin(parentWork, eq(parentWork.id, elements.workId))
		.innerJoin(
			services,
			or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId))
		)
		.where(
			and(
				eq(evidenceTargets.currentStatus, 'in_review'),
				allowed ? inArray(services.id, allowed) : undefined
			)
		);
	return row?.value ?? 0;
}

export interface DashboardSummary {
	serviceCount: number;
	totalTargets: number;
	approvedTargets: number;
	/** Trabajos con al menos un objetivo. */
	workTotal: number;
	/** Trabajos con todos sus objetivos aprobados. */
	workApproved: number;
	pendingReviews: number;
}

export async function dashboardSummary(db: Database, user: SessionUser): Promise<DashboardSummary> {
	const allowed = await visibleServiceIds(db, user);
	if (allowed && allowed.length === 0) {
		return {
			serviceCount: 0,
			totalTargets: 0,
			approvedTargets: 0,
			workTotal: 0,
			workApproved: 0,
			pendingReviews: 0
		};
	}
	const scope = allowed ? inArray(services.id, allowed) : undefined;

	const parentWork = alias(works, 'parent_work');
	const [servicesRow, targetsRow, workTotals, pendingReviews] = await Promise.all([
		db
			.select({ value: sql<number>`cast(count(*) as int)` })
			.from(services)
			.where(scope),
		db
			.select({
				total: sql<number>`cast(count(*) as int)`,
				approved: sql<number>`cast(count(*) filter (where ${evidenceTargets.currentStatus} = 'approved') as int)`
			})
			.from(evidenceTargets)
			.leftJoin(works, eq(works.id, evidenceTargets.workId))
			.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
			.leftJoin(parentWork, eq(parentWork.id, elements.workId))
			.innerJoin(
				services,
				or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId))
			)
			.where(scope),
		workTargetTotals(db, allowed),
		countPendingReviews(db, user)
	]);

	return {
		serviceCount: servicesRow[0]?.value ?? 0,
		totalTargets: targetsRow[0]?.total ?? 0,
		approvedTargets: targetsRow[0]?.approved ?? 0,
		workTotal: workTotals.length,
		workApproved: workTotals.filter((row) => row.total > 0 && row.approved === row.total).length,
		pendingReviews
	};
}
