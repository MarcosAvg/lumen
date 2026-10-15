import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import {
	catalogItems,
	elements,
	evidenceSubmissions,
	evidenceTargets,
	photoRequirements,
	photos,
	reviews,
	serviceAssignments,
	services,
	works
} from '#lib/server/db/schema';
import type { SessionUser, TargetStatus } from '#lib/types';

/**
 * Tablero por rol (docs/05 §4). Todo se calcula dentro del **ámbito** del
 * usuario: administrador (global) o asignación vigente. Nunca se expone un
 * total que incluya servicios ajenos.
 */

/** Servicios visibles: `null` = todos (admin); array = asignados vigentes. */
async function visibleServiceIds(db: Database, user: SessionUser): Promise<string[] | null> {
	if (user.role === 'admin') return null;
	const rows = await db
		.select({ serviceId: serviceAssignments.serviceId })
		.from(serviceAssignments)
		.where(and(eq(serviceAssignments.userId, user.id), isNull(serviceAssignments.revokedAt)));
	return [...new Set(rows.map((row) => row.serviceId))];
}

export interface AttentionTarget {
	targetId: string;
	type: 'work' | 'element';
	/** `workId` para trabajos directos; `elementId` para elementos. */
	id: string;
	label: string;
	workName: string;
	status: TargetStatus;
	serviceId: string;
	serviceName: string;
	rejectionReason: string | null;
	requiredCount: number;
	satisfiedCount: number;
	readyPhotoCount: number;
}

/**
 * Objetivos editables (pendientes, en progreso o rechazados) dentro del ámbito,
 * con los rechazados primero. Sin N+1.
 */
export async function listAttentionTargets(
	db: Database,
	user: SessionUser
): Promise<AttentionTarget[]> {
	const allowed = await visibleServiceIds(db, user);
	if (allowed && allowed.length === 0) return [];

	const workCatalog = alias(catalogItems, 'work_catalog');
	const parentWork = alias(works, 'parent_work');
	const parentWorkCatalog = alias(catalogItems, 'parent_work_catalog');
	const elementCatalog = alias(catalogItems, 'element_catalog');

	const rows = await db
		.select({
			targetId: evidenceTargets.id,
			workId: evidenceTargets.workId,
			elementId: evidenceTargets.elementId,
			status: evidenceTargets.currentStatus,
			serviceId: services.id,
			serviceName: services.name,
			directLabel: sql<string | null>`coalesce(${workCatalog.name}, ${works.customName})`,
			parentLabel: sql<
				string | null
			>`coalesce(${parentWorkCatalog.name}, ${parentWork.customName})`,
			elementLabel: sql<string | null>`coalesce(${elementCatalog.name}, ${elements.customName})`
		})
		.from(evidenceTargets)
		.leftJoin(works, eq(works.id, evidenceTargets.workId))
		.leftJoin(elements, eq(elements.id, evidenceTargets.elementId))
		.leftJoin(parentWork, eq(parentWork.id, elements.workId))
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.leftJoin(parentWorkCatalog, eq(parentWorkCatalog.id, parentWork.catalogItemId))
		.leftJoin(elementCatalog, eq(elementCatalog.id, elements.catalogItemId))
		.innerJoin(
			services,
			or(eq(services.id, works.serviceId), eq(services.id, parentWork.serviceId))
		)
		.where(
			and(
				inArray(evidenceTargets.currentStatus, ['pending', 'in_progress', 'rejected']),
				allowed ? inArray(services.id, allowed) : undefined
			)
		)
		.orderBy(
			sql`case ${evidenceTargets.currentStatus} when 'rejected' then 0 when 'in_progress' then 1 else 2 end`,
			desc(evidenceTargets.updatedAt)
		);

	if (rows.length === 0) return [];
	const targetIds = rows.map((row) => row.targetId);

	const [requiredRows, satisfiedRows, photoRows, rejectionRows] = await Promise.all([
		db
			.select({
				targetId: photoRequirements.targetId,
				value: sql<number>`cast(count(*) as int)`
			})
			.from(photoRequirements)
			.where(
				and(inArray(photoRequirements.targetId, targetIds), eq(photoRequirements.isRequired, true))
			)
			.groupBy(photoRequirements.targetId),
		db
			.select({
				targetId: photoRequirements.targetId,
				value: sql<number>`cast(count(distinct ${photoRequirements.id}) as int)`
			})
			.from(photoRequirements)
			.innerJoin(photos, eq(photos.requirementId, photoRequirements.id))
			.where(
				and(
					inArray(photoRequirements.targetId, targetIds),
					eq(photoRequirements.isRequired, true),
					isNull(photos.removedAt),
					eq(photos.processingStatus, 'ready')
				)
			)
			.groupBy(photoRequirements.targetId),
		db
			.select({ targetId: photos.targetId, value: sql<number>`cast(count(*) as int)` })
			.from(photos)
			.where(
				and(
					inArray(photos.targetId, targetIds),
					isNull(photos.removedAt),
					eq(photos.processingStatus, 'ready')
				)
			)
			.groupBy(photos.targetId),
		db
			.select({
				targetId: evidenceSubmissions.targetId,
				reason: reviews.reason
			})
			.from(reviews)
			.innerJoin(evidenceSubmissions, eq(evidenceSubmissions.id, reviews.submissionId))
			.where(
				and(inArray(evidenceSubmissions.targetId, targetIds), eq(reviews.decision, 'rejected'))
			)
			.orderBy(desc(reviews.reviewedAt))
	]);

	const requiredByTarget = new Map(requiredRows.map((row) => [row.targetId, row.value]));
	const satisfiedByTarget = new Map(satisfiedRows.map((row) => [row.targetId, row.value]));
	const photoByTarget = new Map(photoRows.map((row) => [row.targetId, row.value]));
	const rejectionByTarget = new Map<string, string>();
	for (const row of rejectionRows) {
		if (row.reason && !rejectionByTarget.has(row.targetId)) {
			rejectionByTarget.set(row.targetId, row.reason);
		}
	}

	return rows.map((row) => {
		const isElement = row.elementId !== null;
		const label = (isElement ? row.elementLabel : row.directLabel) ?? 'Sin nombre';
		return {
			targetId: row.targetId,
			type: isElement ? 'element' : 'work',
			id: (isElement ? row.elementId : row.workId) as string,
			label,
			workName: (isElement ? row.parentLabel : row.directLabel) ?? label,
			status: row.status,
			serviceId: row.serviceId,
			serviceName: row.serviceName,
			rejectionReason: rejectionByTarget.get(row.targetId) ?? null,
			requiredCount: requiredByTarget.get(row.targetId) ?? 0,
			satisfiedCount: satisfiedByTarget.get(row.targetId) ?? 0,
			readyPhotoCount: photoByTarget.get(row.targetId) ?? 0
		} satisfies AttentionTarget;
	});
}

/** Entregas pendientes de revisión dentro del ámbito (admin/supervisor). */
export async function countPendingReviews(db: Database, user: SessionUser): Promise<number> {
	if (user.role === 'technician') return 0;

	let allowed: string[] | null = null;
	if (user.role !== 'admin') {
		const rows = await db
			.select({ serviceId: serviceAssignments.serviceId })
			.from(serviceAssignments)
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
	pendingReviews: number;
}

export async function dashboardSummary(db: Database, user: SessionUser): Promise<DashboardSummary> {
	const allowed = await visibleServiceIds(db, user);
	if (allowed && allowed.length === 0) {
		return { serviceCount: 0, totalTargets: 0, approvedTargets: 0, pendingReviews: 0 };
	}
	const scope = allowed ? inArray(services.id, allowed) : undefined;

	const parentWork = alias(works, 'parent_work');
	const [servicesRow, targetsRow, pendingReviews] = await Promise.all([
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
		countPendingReviews(db, user)
	]);

	return {
		serviceCount: servicesRow[0]?.value ?? 0,
		totalTargets: targetsRow[0]?.total ?? 0,
		approvedTargets: targetsRow[0]?.approved ?? 0,
		pendingReviews
	};
}
