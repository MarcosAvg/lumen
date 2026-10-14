import { eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import { catalogItems, elements, evidenceTargets, services, works } from '#lib/server/db/schema';
import type { TargetStatus, WorkMode } from '#lib/types';
import { DomainError } from './errors';

export interface TargetContext {
	id: string;
	workId: string | null;
	elementId: string | null;
	serviceId: string;
	serviceName: string;
	/** Nombre visible del trabajo o elemento que contiene el objetivo. */
	label: string;
	/** Nombre visible del trabajo padre (igual a `label` en trabajos directos). */
	workName: string;
	mode: WorkMode;
	status: TargetStatus;
	version: number;
}

async function workLabel(db: Database, workId: string) {
	const [row] = await db
		.select({
			serviceId: works.serviceId,
			serviceName: services.name,
			mode: works.mode,
			label: sql<string>`coalesce(${catalogItems.name}, ${works.customName})`
		})
		.from(works)
		.innerJoin(services, eq(services.id, works.serviceId))
		.leftJoin(catalogItems, eq(catalogItems.id, works.catalogItemId))
		.where(eq(works.id, workId))
		.limit(1);
	return row ?? null;
}

async function elementLabel(db: Database, elementId: string) {
	const workCatalog = alias(catalogItems, 'work_catalog');
	const [row] = await db
		.select({
			serviceId: works.serviceId,
			serviceName: services.name,
			workMode: works.mode,
			label: sql<string>`coalesce(${catalogItems.name}, ${elements.customName})`,
			workName: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`
		})
		.from(elements)
		.innerJoin(works, eq(works.id, elements.workId))
		.innerJoin(services, eq(services.id, works.serviceId))
		.leftJoin(catalogItems, eq(catalogItems.id, elements.catalogItemId))
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.where(eq(elements.id, elementId))
		.limit(1);
	return row ?? null;
}

/** Resuelve el contexto canónico de un objetivo (trabajo directo o elemento). */
export async function getTargetContext(db: Database, targetId: string): Promise<TargetContext> {
	const [target] = await db
		.select()
		.from(evidenceTargets)
		.where(eq(evidenceTargets.id, targetId))
		.limit(1);
	if (!target) throw new DomainError(404, 'Evidencia no encontrada.');

	if (target.workId) {
		const work = await workLabel(db, target.workId);
		if (!work) throw new DomainError(404, 'Evidencia no encontrada.');
		return {
			id: target.id,
			workId: target.workId,
			elementId: null,
			serviceId: work.serviceId,
			serviceName: work.serviceName,
			label: work.label,
			workName: work.label,
			mode: work.mode,
			status: target.currentStatus,
			version: target.version
		};
	}

	const element = await elementLabel(db, target.elementId as string);
	if (!element) throw new DomainError(404, 'Evidencia no encontrada.');
	return {
		id: target.id,
		workId: null,
		elementId: target.elementId,
		serviceId: element.serviceId,
		serviceName: element.serviceName,
		label: element.label,
		workName: element.workName,
		mode: 'divided',
		status: target.currentStatus,
		version: target.version
	};
}

/** Objetivo de un trabajo directo. */
export async function getTargetForWork(db: Database, workId: string): Promise<TargetContext> {
	const [target] = await db
		.select({ id: evidenceTargets.id })
		.from(evidenceTargets)
		.where(eq(evidenceTargets.workId, workId))
		.limit(1);
	if (!target) throw new DomainError(404, 'Este trabajo no tiene evidencia directa.');
	return getTargetContext(db, target.id);
}

/** Objetivo de un elemento. */
export async function getTargetForElement(db: Database, elementId: string): Promise<TargetContext> {
	const [target] = await db
		.select({ id: evidenceTargets.id })
		.from(evidenceTargets)
		.where(eq(evidenceTargets.elementId, elementId))
		.limit(1);
	if (!target) throw new DomainError(404, 'Este elemento no tiene evidencia.');
	return getTargetContext(db, target.id);
}

export function isEditableStatus(status: TargetStatus): boolean {
	return status === 'pending' || status === 'in_progress' || status === 'rejected';
}
