import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import {
	catalogItems,
	contractAssignments,
	contracts,
	elements,
	evidenceSubmissions,
	evidenceTargets,
	photos,
	reviews,
	serviceAssignments,
	services,
	users,
	works
} from '#lib/server/db/schema';
import type { SessionUser, TargetStatus, WorkMode } from '#lib/types';
import { listAllowedServiceIds } from './services';
import { listServiceProgress } from './works';

/**
 * Tablero por rol (docs/producto/experiencia.md). Todo se calcula dentro del **ámbito** del
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
					eq(services.lifecycle, 'active'),
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
				and(
					eq(reviews.decision, 'rejected'),
					eq(services.lifecycle, 'active'),
					allowed ? inArray(services.id, allowed) : undefined
				)
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
		.where(
			and(eq(services.lifecycle, 'active'), allowed ? inArray(services.id, allowed) : undefined)
		)
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
					isNull(serviceAssignments.revokedAt),
					eq(services.lifecycle, 'active')
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
				eq(services.lifecycle, 'active'),
				allowed ? inArray(services.id, allowed) : undefined
			)
		);
	return row?.value ?? 0;
}

export interface DashboardStatusCounts {
	pending: number;
	in_progress: number;
	in_review: number;
	rejected: number;
	approved: number;
	total: number;
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
	approvedLast7: number;
	statusCounts: DashboardStatusCounts;
	/** Solo administradores. */
	activeUsers: number | null;
	/** Solo administradores. */
	contractCount: number | null;
}

export interface RecentEvidencePhoto {
	id: string;
	workId: string;
	elementId: string | null;
	workName: string;
	serviceName: string;
	status: TargetStatus;
	uploadedAt: Date;
	uploadedByName: string | null;
}

/**
 * Últimas fotos visibles para el usuario, acotadas por su ámbito. Se usan como
 * franja visual del tablero; no sustituyen la galería de evidencia.
 */
export async function listRecentEvidencePhotos(
	db: Database,
	user: SessionUser,
	limit = 6
): Promise<RecentEvidencePhoto[]> {
	const allowed = await visibleServiceIds(db, user);
	if (allowed && allowed.length === 0) return [];

	const parentWork = alias(works, 'recent_parent_work');
	const workCatalog = alias(catalogItems, 'recent_work_catalog');
	const parentWorkCatalog = alias(catalogItems, 'recent_parent_work_catalog');
	const scopedService = or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId));

	const rows = await db
		.select({
			id: photos.id,
			workId: sql<string | null>`coalesce(${works.id}, ${parentWork.id})`,
			elementId: elements.id,
			workName: sql<
				string | null
			>`coalesce(${workCatalog.name}, ${works.customName}, ${parentWorkCatalog.name}, ${parentWork.customName})`,
			serviceName: services.name,
			status: evidenceTargets.currentStatus,
			uploadedAt: photos.uploadedAt,
			uploadedByName: photos.uploadedByName
		})
		.from(photos)
		.innerJoin(evidenceTargets, eq(evidenceTargets.id, photos.targetId))
		.leftJoin(works, eq(works.id, evidenceTargets.workId))
		.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
		.leftJoin(parentWork, eq(parentWork.id, elements.workId))
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.leftJoin(parentWorkCatalog, eq(parentWorkCatalog.id, parentWork.catalogItemId))
		.innerJoin(services, scopedService)
		.where(
			and(
				eq(photos.processingStatus, 'ready'),
				isNull(photos.removedAt),
				eq(services.lifecycle, 'active'),
				allowed ? inArray(services.id, allowed) : undefined
			)
		)
		.orderBy(desc(photos.uploadedAt))
		.limit(limit);

	return rows.flatMap((row) =>
		row.workId
			? [
					{
						id: row.id,
						workId: row.workId,
						elementId: row.elementId,
						workName: row.workName ?? 'Sin nombre',
						serviceName: row.serviceName,
						status: row.status,
						uploadedAt: row.uploadedAt,
						uploadedByName: row.uploadedByName
					}
				]
			: []
	);
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
			pendingReviews: 0,
			approvedLast7: 0,
			statusCounts: {
				pending: 0,
				in_progress: 0,
				in_review: 0,
				rejected: 0,
				approved: 0,
				total: 0
			},
			activeUsers: user.role === 'admin' ? await countActiveUsers(db) : null,
			contractCount: user.role === 'admin' ? await countContracts(db) : null
		};
	}
	const scope = and(
		eq(services.lifecycle, 'active'),
		allowed ? inArray(services.id, allowed) : undefined
	);
	const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const parentWork = alias(works, 'parent_work');
	const [activeServiceRows, statusRow, workTotals, pendingReviews, approvedLast7Row] =
		await Promise.all([
			db.select({ id: services.id }).from(services).where(scope),
			db
				.select({
					total: sql<number>`cast(count(*) as int)`,
					pending: sql<number>`cast(count(*) filter (where ${evidenceTargets.currentStatus} = 'pending') as int)`,
					inProgress: sql<number>`cast(count(*) filter (where ${evidenceTargets.currentStatus} = 'in_progress') as int)`,
					inReview: sql<number>`cast(count(*) filter (where ${evidenceTargets.currentStatus} = 'in_review') as int)`,
					rejected: sql<number>`cast(count(*) filter (where ${evidenceTargets.currentStatus} = 'rejected') as int)`,
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
			countPendingReviews(db, user),
			db
				.select({ value: sql<number>`cast(count(*) as int)` })
				.from(reviews)
				.innerJoin(evidenceSubmissions, eq(evidenceSubmissions.id, reviews.submissionId))
				.innerJoin(evidenceTargets, eq(evidenceTargets.id, evidenceSubmissions.targetId))
				.leftJoin(works, eq(works.id, evidenceTargets.workId))
				.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
				.leftJoin(parentWork, eq(parentWork.id, elements.workId))
				.innerJoin(
					services,
					or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId))
				)
				.where(and(eq(reviews.decision, 'approved'), gte(reviews.reviewedAt, since), scope))
		]);

	const adminCounts =
		user.role === 'admin' ? await Promise.all([countActiveUsers(db), countContracts(db)]) : null;

	const progress = await listServiceProgress(
		db,
		activeServiceRows.map((row) => row.id)
	);
	const completedServices = activeServiceRows.filter((row) => {
		const entry = progress.get(row.id);
		return (
			entry !== undefined && entry.totalTargets > 0 && entry.approvedTargets === entry.totalTargets
		);
	}).length;
	const counts = statusRow[0];
	return {
		serviceCount: activeServiceRows.length - completedServices,
		totalTargets: counts?.total ?? 0,
		approvedTargets: counts?.approved ?? 0,
		workTotal: workTotals.length,
		workApproved: workTotals.filter((row) => row.total > 0 && row.approved === row.total).length,
		pendingReviews,
		approvedLast7: approvedLast7Row[0]?.value ?? 0,
		statusCounts: {
			pending: counts?.pending ?? 0,
			in_progress: counts?.inProgress ?? 0,
			in_review: counts?.inReview ?? 0,
			rejected: counts?.rejected ?? 0,
			approved: counts?.approved ?? 0,
			total: counts?.total ?? 0
		},
		activeUsers: adminCounts?.[0] ?? null,
		contractCount: adminCounts?.[1] ?? null
	};
}

async function countActiveUsers(db: Database): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`cast(count(*) as int)` })
		.from(users)
		.where(eq(users.isActive, true));
	return row?.value ?? 0;
}

async function countContracts(db: Database): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`cast(count(*) as int)` })
		.from(contracts)
		.where(eq(contracts.lifecycle, 'active'));
	return row?.value ?? 0;
}

export interface ContractPulse {
	contractId: string;
	name: string;
	serviceCount: number;
	totalTargets: number;
	approvedTargets: number;
	pendingReviews: number;
	rejectedTargets: number;
	lastActivity: Date | null;
}

export interface ServicePulse {
	serviceId: string;
	name: string;
	totalTargets: number;
	approvedTargets: number;
	pendingReviews: number;
	rejectedTargets: number;
	lastActivity: Date | null;
}

/** Contratos con más bloqueos o cola de revisión (solo admin). */
export async function listContractPulse(db: Database, limit = 6): Promise<ContractPulse[]> {
	const parentWork = alias(works, 'pulse_parent_work');
	const [contractRows, serviceCounts, stats] = await Promise.all([
		db
			.select({ id: contracts.id, name: contracts.name })
			.from(contracts)
			.where(eq(contracts.lifecycle, 'active')),
		db
			.select({
				contractId: services.contractId,
				value: sql<number>`cast(count(*) as int)`
			})
			.from(services)
			.where(eq(services.lifecycle, 'active'))
			.groupBy(services.contractId),
		db
			.select({
				contractId: services.contractId,
				total: sql<number>`cast(count(distinct ${evidenceTargets.id}) as int)`,
				approved: sql<number>`cast(count(distinct ${evidenceTargets.id}) filter (where ${evidenceTargets.currentStatus} = 'approved') as int)`,
				pending: sql<number>`cast(count(distinct ${evidenceTargets.id}) filter (where ${evidenceTargets.currentStatus} = 'in_review') as int)`,
				rejected: sql<number>`cast(count(distinct ${evidenceTargets.id}) filter (where ${evidenceTargets.currentStatus} = 'rejected') as int)`,
				lastActivity: sql<Date | null>`max(${evidenceSubmissions.submittedAt})`
			})
			.from(evidenceTargets)
			.leftJoin(works, eq(works.id, evidenceTargets.workId))
			.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
			.leftJoin(parentWork, eq(parentWork.id, elements.workId))
			.innerJoin(
				services,
				or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId))
			)
			.leftJoin(evidenceSubmissions, eq(evidenceSubmissions.targetId, evidenceTargets.id))
			.where(eq(services.lifecycle, 'active'))
			.groupBy(services.contractId)
	]);

	const serviceMap = new Map(serviceCounts.map((row) => [row.contractId, row.value]));
	const statsMap = new Map(stats.map((row) => [row.contractId, row]));
	return contractRows
		.map((row) => {
			const stat = statsMap.get(row.id);
			return {
				contractId: row.id,
				name: row.name,
				serviceCount: serviceMap.get(row.id) ?? 0,
				totalTargets: stat?.total ?? 0,
				approvedTargets: stat?.approved ?? 0,
				pendingReviews: stat?.pending ?? 0,
				rejectedTargets: stat?.rejected ?? 0,
				lastActivity: stat?.lastActivity ?? null
			};
		})
		.filter((row) => row.serviceCount > 0)
		.sort(
			(a, b) =>
				b.pendingReviews + b.rejectedTargets - (a.pendingReviews + a.rejectedTargets) ||
				b.totalTargets - a.totalTargets ||
				a.name.localeCompare(b.name, 'es')
		)
		.slice(0, limit);
}

/** Servicios del supervisor ordenados por bloqueo y cola (solo supervisor). */
export async function listServicePulse(
	db: Database,
	user: SessionUser,
	limit = 6
): Promise<ServicePulse[]> {
	if (user.role !== 'supervisor') return [];
	const allowed = await visibleServiceIds(db, user);
	if (!allowed || allowed.length === 0) return [];

	const parentWork = alias(works, 'service_pulse_parent_work');
	const [serviceRows, stats] = await Promise.all([
		db
			.select({ id: services.id, name: services.name })
			.from(services)
			.where(and(inArray(services.id, allowed), eq(services.lifecycle, 'active'))),
		db
			.select({
				serviceId: services.id,
				total: sql<number>`cast(count(distinct ${evidenceTargets.id}) as int)`,
				approved: sql<number>`cast(count(distinct ${evidenceTargets.id}) filter (where ${evidenceTargets.currentStatus} = 'approved') as int)`,
				pending: sql<number>`cast(count(distinct ${evidenceTargets.id}) filter (where ${evidenceTargets.currentStatus} = 'in_review') as int)`,
				rejected: sql<number>`cast(count(distinct ${evidenceTargets.id}) filter (where ${evidenceTargets.currentStatus} = 'rejected') as int)`,
				lastActivity: sql<Date | null>`max(${evidenceSubmissions.submittedAt})`
			})
			.from(evidenceTargets)
			.leftJoin(works, eq(works.id, evidenceTargets.workId))
			.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
			.leftJoin(parentWork, eq(parentWork.id, elements.workId))
			.innerJoin(
				services,
				or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId))
			)
			.leftJoin(evidenceSubmissions, eq(evidenceSubmissions.targetId, evidenceTargets.id))
			.where(and(inArray(services.id, allowed), eq(services.lifecycle, 'active')))
			.groupBy(services.id)
	]);

	const statsMap = new Map(stats.map((row) => [row.serviceId, row]));
	return serviceRows
		.map((row) => {
			const stat = statsMap.get(row.id);
			return {
				serviceId: row.id,
				name: row.name,
				totalTargets: stat?.total ?? 0,
				approvedTargets: stat?.approved ?? 0,
				pendingReviews: stat?.pending ?? 0,
				rejectedTargets: stat?.rejected ?? 0,
				lastActivity: stat?.lastActivity ?? null
			};
		})
		.filter((row) => !(row.totalTargets > 0 && row.approvedTargets === row.totalTargets))
		.sort((a, b) => {
			const score = (row: ServicePulse) =>
				row.pendingReviews + row.rejectedTargets + (row.totalTargets === 0 ? 100 : 0);
			return score(b) - score(a) || a.name.localeCompare(b.name, 'es');
		})
		.slice(0, limit);
}

export interface RecentDecision {
	reviewId: string;
	submissionId: string;
	decision: 'approved' | 'rejected';
	reason: string | null;
	reviewedAt: Date;
	reviewerName: string | null;
	serviceId: string;
	serviceName: string;
	workName: string;
	targetName: string | null;
}

/** Últimas decisiones del ámbito (admin o supervisor). */
export async function listRecentDecisions(
	db: Database,
	user: SessionUser,
	limit = 6
): Promise<RecentDecision[]> {
	if (user.role === 'technician') return [];
	const allowed = await visibleServiceIds(db, user);
	if (allowed && allowed.length === 0) return [];

	const parentWork = alias(works, 'decision_parent_work');
	const workCatalog = alias(catalogItems, 'decision_work_catalog');
	const parentWorkCatalog = alias(catalogItems, 'decision_parent_work_catalog');
	const scopedService = or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId));

	return db
		.select({
			reviewId: reviews.id,
			submissionId: reviews.submissionId,
			decision: reviews.decision,
			reason: reviews.reason,
			reviewedAt: reviews.reviewedAt,
			reviewerName: reviews.reviewerName,
			serviceId: services.id,
			serviceName: services.name,
			workName: sql<
				string | null
			>`coalesce(${workCatalog.name}, ${works.customName}, ${parentWorkCatalog.name}, ${parentWork.customName})`,
			targetName: evidenceSubmissions.targetNameSnapshot
		})
		.from(reviews)
		.innerJoin(evidenceSubmissions, eq(evidenceSubmissions.id, reviews.submissionId))
		.innerJoin(evidenceTargets, eq(evidenceTargets.id, evidenceSubmissions.targetId))
		.leftJoin(works, eq(works.id, evidenceTargets.workId))
		.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
		.leftJoin(parentWork, eq(parentWork.id, elements.workId))
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.leftJoin(parentWorkCatalog, eq(parentWorkCatalog.id, parentWork.catalogItemId))
		.innerJoin(services, scopedService)
		.where(
			and(eq(services.lifecycle, 'active'), allowed ? inArray(services.id, allowed) : undefined)
		)
		.orderBy(desc(reviews.reviewedAt))
		.limit(limit)
		.then((rows) =>
			rows.map((row) => ({
				reviewId: row.reviewId,
				submissionId: row.submissionId,
				decision: row.decision,
				reason: row.reason,
				reviewedAt: row.reviewedAt,
				reviewerName: row.reviewerName,
				serviceId: row.serviceId,
				serviceName: row.serviceName,
				workName: row.workName ?? 'Sin nombre',
				targetName: row.targetName
			}))
		);
}

export interface ReviewTrendPoint {
	date: string;
	submitted: number;
	approved: number;
	rejected: number;
}

/** Actividad de envíos y revisiones en los últimos `days` días. */
export async function reviewTrend(
	db: Database,
	user: SessionUser,
	days = 30
): Promise<ReviewTrendPoint[]> {
	if (user.role === 'technician') return [];
	const allowed = await visibleServiceIds(db, user);
	if (allowed && allowed.length === 0) return [];

	const start = new Date();
	start.setUTCHours(0, 0, 0, 0);
	start.setUTCDate(start.getUTCDate() - (days - 1));

	const parentWork = alias(works, 'trend_parent_work');
	const scopedService = or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId));
	const [submittedRows, reviewRows] = await Promise.all([
		db
			.select({
				date: sql<string>`to_char(date_trunc('day', ${evidenceSubmissions.submittedAt}), 'YYYY-MM-DD')`,
				value: sql<number>`cast(count(*) as int)`
			})
			.from(evidenceSubmissions)
			.innerJoin(evidenceTargets, eq(evidenceTargets.id, evidenceSubmissions.targetId))
			.leftJoin(works, eq(works.id, evidenceTargets.workId))
			.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
			.leftJoin(parentWork, eq(parentWork.id, elements.workId))
			.innerJoin(services, scopedService)
			.where(
				and(
					gte(evidenceSubmissions.submittedAt, start),
					eq(services.lifecycle, 'active'),
					allowed ? inArray(services.id, allowed) : undefined
				)
			)
			.groupBy(sql`date_trunc('day', ${evidenceSubmissions.submittedAt})`),
		db
			.select({
				date: sql<string>`to_char(date_trunc('day', ${reviews.reviewedAt}), 'YYYY-MM-DD')`,
				decision: reviews.decision,
				value: sql<number>`cast(count(*) as int)`
			})
			.from(reviews)
			.innerJoin(evidenceSubmissions, eq(evidenceSubmissions.id, reviews.submissionId))
			.innerJoin(evidenceTargets, eq(evidenceTargets.id, evidenceSubmissions.targetId))
			.leftJoin(works, eq(works.id, evidenceTargets.workId))
			.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
			.leftJoin(parentWork, eq(parentWork.id, elements.workId))
			.innerJoin(services, scopedService)
			.where(
				and(
					gte(reviews.reviewedAt, start),
					eq(services.lifecycle, 'active'),
					allowed ? inArray(services.id, allowed) : undefined
				)
			)
			.groupBy(sql`date_trunc('day', ${reviews.reviewedAt})`, reviews.decision)
	]);

	const keys: string[] = [];
	for (let i = 0; i < days; i += 1) {
		const date = new Date(start);
		date.setUTCDate(start.getUTCDate() + i);
		keys.push(date.toISOString().slice(0, 10));
	}
	const byDate = new Map(
		keys.map((date) => [date, { date, submitted: 0, approved: 0, rejected: 0 }])
	);
	for (const row of submittedRows) {
		const point = byDate.get(row.date);
		if (point) point.submitted += row.value;
	}
	for (const row of reviewRows) {
		const point = byDate.get(row.date);
		if (!point) continue;
		if (row.decision === 'approved') point.approved += row.value;
		else point.rejected += row.value;
	}
	return keys.map((date) => byDate.get(date)!);
}
