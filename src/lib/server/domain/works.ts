import { asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import { catalogItems, elements, evidenceTargets, services, works } from '#lib/server/db/schema';
import type { TargetStatus, WorkMode } from '#lib/types';
import { recordAudit } from './audit';
import { assertCatalogItemAvailableForService } from './catalog-scope';
import { DomainError } from './errors';
import { insertRequirements, type RequirementInput } from './requirements';
import { visibleElementName, visibleWorkName } from './works-shared';

function countInt() {
	return sql<number>`cast(count(*) as int)`;
}

export interface NameSource {
	catalogItemId?: string | null;
	name?: string | null;
}

async function resolveNameSource(
	db: Database,
	source: NameSource,
	serviceId: string
): Promise<{ catalogItemId: string | null; customName: string | null }> {
	const hasCatalog = Boolean(source.catalogItemId);
	const custom = source.name?.trim() ?? '';
	const hasCustom = custom.length > 0;

	if (hasCatalog === hasCustom) {
		throw new DomainError(
			400,
			'Debes indicar un ítem de catálogo o un nombre personalizado (exactamente uno).'
		);
	}

	if (hasCatalog) {
		const [item] = await db
			.select({ id: catalogItems.id })
			.from(catalogItems)
			.where(eq(catalogItems.id, source.catalogItemId as string))
			.limit(1);
		if (!item) throw new DomainError(404, 'Ítem de catálogo no encontrado.');
		await assertCatalogItemAvailableForService(db, serviceId, item.id);
		return { catalogItemId: item.id, customName: null };
	}

	return { catalogItemId: null, customName: custom };
}

export interface CreateWorkElementInput {
	catalogItemId?: string | null;
	name?: string | null;
}

export interface CreateWorkInput {
	serviceId: string;
	mode: WorkMode;
	description?: string | null;
	catalogItemId?: string | null;
	name?: string | null;
	/** Elementos a crear junto al trabajo (solo si `mode === 'divided'`). */
	elements?: CreateWorkElementInput[];
	/** Requisitos a aplicar al objetivo directo o a cada elemento. */
	requirements?: RequirementInput[];
	requirementIsRequired?: boolean;
	actorId: string;
}

export async function createWork(
	db: Database,
	input: CreateWorkInput
): Promise<{ id: string; targetId: string | null; elementIds: string[] }> {
	return db.transaction(async (tx) => {
		const [service] = await tx
			.select({ id: services.id, lifecycle: services.lifecycle })
			.from(services)
			.where(eq(services.id, input.serviceId))
			.limit(1);
		if (!service) throw new DomainError(404, 'Servicio no encontrado.');
		if (service.lifecycle === 'archived') {
			throw new DomainError(409, 'Un servicio archivado no admite cambios de estructura.');
		}

		const elementInputs = input.elements ?? [];
		if (input.mode !== 'divided' && elementInputs.length > 0) {
			throw new DomainError(400, 'Un trabajo directo no puede tener elementos.');
		}
		const requirements = input.requirements ?? [];
		const requirementIsRequired = input.requirementIsRequired ?? true;

		const name = await resolveNameSource(tx, input, input.serviceId);
		const [next] = await tx
			.select({ value: sql<number>`coalesce(max(${works.sortOrder}), -1) + 1` })
			.from(works)
			.where(eq(works.serviceId, input.serviceId));

		const [created] = await tx
			.insert(works)
			.values({
				serviceId: input.serviceId,
				mode: input.mode,
				catalogItemId: name.catalogItemId,
				customName: name.customName,
				description: input.description?.trim() || null,
				sortOrder: next?.value ?? 0
			})
			.returning({ id: works.id });

		// Un trabajo directo posee un único objetivo propio; el dividido no tiene evidencia de padre.
		let targetId: string | null = null;
		if (input.mode === 'direct') {
			const [target] = await tx
				.insert(evidenceTargets)
				.values({ workId: created.id })
				.returning({ id: evidenceTargets.id });
			targetId = target.id;
			if (requirements.length > 0) {
				await insertRequirements(tx, {
					targetId: target.id,
					serviceId: input.serviceId,
					requirements,
					isRequired: requirementIsRequired
				});
			}
		}

		// Elementos creados junto al trabajo dividido, cada uno con su objetivo.
		const elementIds: string[] = [];
		let elementSort = 0;
		for (const element of elementInputs) {
			const elementName = await resolveNameSource(tx, element, input.serviceId);
			const [createdElement] = await tx
				.insert(elements)
				.values({
					workId: created.id,
					catalogItemId: elementName.catalogItemId,
					customName: elementName.customName,
					sortOrder: elementSort
				})
				.returning({ id: elements.id });
			const [target] = await tx
				.insert(evidenceTargets)
				.values({ elementId: createdElement.id })
				.returning({ id: evidenceTargets.id });
			if (requirements.length > 0) {
				await insertRequirements(tx, {
					targetId: target.id,
					serviceId: input.serviceId,
					requirements,
					isRequired: requirementIsRequired
				});
			}
			elementIds.push(createdElement.id);
			elementSort += 1;
		}

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: input.serviceId,
			entityType: 'work',
			entityId: created.id,
			action: 'work.created',
			metadata: { mode: input.mode, elements: elementIds.length, requirements: requirements.length }
		});

		return { id: created.id, targetId, elementIds };
	});
}

export interface CreateElementInput {
	workId: string;
	description?: string | null;
	catalogItemId?: string | null;
	name?: string | null;
	actorId: string;
}

export async function createElement(
	db: Database,
	input: CreateElementInput
): Promise<{ id: string; targetId: string }> {
	return db.transaction(async (tx) => {
		const [work] = await tx
			.select({
				id: works.id,
				mode: works.mode,
				serviceId: works.serviceId,
				serviceLifecycle: services.lifecycle
			})
			.from(works)
			.innerJoin(services, eq(services.id, works.serviceId))
			.where(eq(works.id, input.workId))
			.limit(1);
		if (!work) throw new DomainError(404, 'Trabajo no encontrado.');
		if (work.serviceLifecycle === 'archived') {
			throw new DomainError(409, 'Un servicio archivado no admite cambios de estructura.');
		}
		if (work.mode !== 'divided') {
			throw new DomainError(409, 'Solo los trabajos divididos pueden tener elementos.');
		}

		const name = await resolveNameSource(tx, input, work.serviceId);
		const [next] = await tx
			.select({ value: sql<number>`coalesce(max(${elements.sortOrder}), -1) + 1` })
			.from(elements)
			.where(eq(elements.workId, input.workId));

		const [created] = await tx
			.insert(elements)
			.values({
				workId: input.workId,
				catalogItemId: name.catalogItemId,
				customName: name.customName,
				description: input.description?.trim() || null,
				sortOrder: next?.value ?? 0
			})
			.returning({ id: elements.id });

		const [target] = await tx
			.insert(evidenceTargets)
			.values({ elementId: created.id })
			.returning({ id: evidenceTargets.id });

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: work.serviceId,
			entityType: 'element',
			entityId: created.id,
			action: 'element.created'
		});

		return { id: created.id, targetId: target.id };
	});
}

export interface AddElementsInput {
	workId: string;
	elements: CreateWorkElementInput[];
	/** Requisitos a aplicar a cada elemento nuevo. */
	requirements?: RequirementInput[];
	requirementIsRequired?: boolean;
	actorId: string;
}

/** Añade varios elementos a un trabajo dividido y sus objetivos, en una transacción. */
export async function addElements(
	db: Database,
	input: AddElementsInput
): Promise<{ elementIds: string[] }> {
	return db.transaction(async (tx) => {
		const [work] = await tx
			.select({
				id: works.id,
				mode: works.mode,
				serviceId: works.serviceId,
				serviceLifecycle: services.lifecycle
			})
			.from(works)
			.innerJoin(services, eq(services.id, works.serviceId))
			.where(eq(works.id, input.workId))
			.limit(1);
		if (!work) throw new DomainError(404, 'Trabajo no encontrado.');
		if (work.serviceLifecycle === 'archived') {
			throw new DomainError(409, 'Un servicio archivado no admite cambios de estructura.');
		}
		if (work.mode !== 'divided') {
			throw new DomainError(409, 'Solo los trabajos divididos pueden tener elementos.');
		}
		if (input.elements.length === 0) {
			throw new DomainError(400, 'Añade al menos un elemento.');
		}
		const requirements = input.requirements ?? [];
		const requirementIsRequired = input.requirementIsRequired ?? true;

		const [base] = await tx
			.select({ value: sql<number>`coalesce(max(${elements.sortOrder}), -1) + 1` })
			.from(elements)
			.where(eq(elements.workId, input.workId));
		let sortOrder = base?.value ?? 0;

		const elementIds: string[] = [];
		for (const element of input.elements) {
			const name = await resolveNameSource(tx, element, work.serviceId);
			const [created] = await tx
				.insert(elements)
				.values({
					workId: input.workId,
					catalogItemId: name.catalogItemId,
					customName: name.customName,
					sortOrder
				})
				.returning({ id: elements.id });
			const [target] = await tx
				.insert(evidenceTargets)
				.values({ elementId: created.id })
				.returning({ id: evidenceTargets.id });
			if (requirements.length > 0) {
				await insertRequirements(tx, {
					targetId: target.id,
					serviceId: work.serviceId,
					requirements,
					isRequired: requirementIsRequired
				});
			}
			elementIds.push(created.id);
			sortOrder += 1;
		}

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: work.serviceId,
			entityType: 'element',
			entityId: work.id,
			action: 'elements.created',
			metadata: { count: elementIds.length, requirements: requirements.length }
		});

		return { elementIds };
	});
}

export interface UpdateNamedItemInput {
	id: string;
	name: string;
	description?: string | null;
	actorId: string;
}

/**
 * Actualiza el nombre/descripción de un trabajo. Si el nombre difiere del ítem de
 * catálogo vinculado, el trabajo se **desvincula** y conserva ese nombre propio.
 */
export async function updateWork(db: Database, input: UpdateNamedItemInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [work] = await tx
			.select({
				id: works.id,
				serviceId: works.serviceId,
				serviceLifecycle: services.lifecycle,
				catalogItemId: works.catalogItemId,
				catalogName: catalogItems.name
			})
			.from(works)
			.innerJoin(services, eq(services.id, works.serviceId))
			.leftJoin(catalogItems, eq(catalogItems.id, works.catalogItemId))
			.where(eq(works.id, input.id))
			.limit(1);
		if (!work) throw new DomainError(404, 'Trabajo no encontrado.');
		if (work.serviceLifecycle === 'archived') {
			throw new DomainError(409, 'Un servicio archivado no admite cambios de estructura.');
		}

		const keepsLink = Boolean(work.catalogItemId) && work.catalogName === input.name.trim();
		await tx
			.update(works)
			.set({
				catalogItemId: keepsLink ? work.catalogItemId : null,
				customName: keepsLink ? null : input.name.trim(),
				description: input.description?.trim() || null,
				updatedAt: new Date()
			})
			.where(eq(works.id, input.id));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: work.serviceId,
			entityType: 'work',
			entityId: input.id,
			action: 'work.updated',
			metadata: { detached: !keepsLink && Boolean(work.catalogItemId) }
		});
	});
}

export async function updateElement(db: Database, input: UpdateNamedItemInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [row] = await tx
			.select({
				id: elements.id,
				workId: elements.workId,
				serviceId: works.serviceId,
				serviceLifecycle: services.lifecycle,
				catalogItemId: elements.catalogItemId,
				catalogName: catalogItems.name
			})
			.from(elements)
			.innerJoin(works, eq(works.id, elements.workId))
			.innerJoin(services, eq(services.id, works.serviceId))
			.leftJoin(catalogItems, eq(catalogItems.id, elements.catalogItemId))
			.where(eq(elements.id, input.id))
			.limit(1);
		if (!row) throw new DomainError(404, 'Elemento no encontrado.');
		if (row.serviceLifecycle === 'archived') {
			throw new DomainError(409, 'Un servicio archivado no admite cambios de estructura.');
		}

		const keepsLink = Boolean(row.catalogItemId) && row.catalogName === input.name.trim();
		await tx
			.update(elements)
			.set({
				catalogItemId: keepsLink ? row.catalogItemId : null,
				customName: keepsLink ? null : input.name.trim(),
				description: input.description?.trim() || null,
				updatedAt: new Date()
			})
			.where(eq(elements.id, input.id));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			serviceId: row.serviceId,
			entityType: 'element',
			entityId: input.id,
			action: 'element.updated',
			metadata: { detached: !keepsLink && Boolean(row.catalogItemId) }
		});
	});
}

export interface WorkListItem {
	id: string;
	name: string;
	mode: WorkMode;
	description: string | null;
	sortOrder: number;
	elementCount: number;
	approvedElements: number;
	workStatus: TargetStatus | null;
	approved: boolean;
}

export async function listWorksDetailed(db: Database, serviceId: string): Promise<WorkListItem[]> {
	const rows = await db
		.select({
			id: works.id,
			mode: works.mode,
			description: works.description,
			sortOrder: works.sortOrder,
			name: visibleWorkName
		})
		.from(works)
		.leftJoin(catalogItems, eq(catalogItems.id, works.catalogItemId))
		.where(eq(works.serviceId, serviceId))
		.orderBy(asc(works.sortOrder), asc(works.createdAt));

	if (rows.length === 0) return [];
	const workIds = rows.map((row) => row.id);

	const elementCounts = await db
		.select({
			workId: elements.workId,
			total: countInt(),
			approved: sql<number>`cast(count(*) filter (where ${evidenceTargets.currentStatus} = 'approved') as int)`
		})
		.from(elements)
		.leftJoin(evidenceTargets, eq(evidenceTargets.elementId, elements.id))
		.where(inArray(elements.workId, workIds))
		.groupBy(elements.workId);

	const directStatuses = await db
		.select({ workId: evidenceTargets.workId, status: evidenceTargets.currentStatus })
		.from(evidenceTargets)
		.where(inArray(evidenceTargets.workId, workIds));

	const countByWork = new Map(elementCounts.map((row) => [row.workId, row]));
	const statusByWork = new Map(directStatuses.map((row) => [row.workId, row.status]));

	return rows.map((row) => {
		const counts = countByWork.get(row.id);
		const elementCount = counts?.total ?? 0;
		const approvedElements = counts?.approved ?? 0;
		const workStatus = row.mode === 'direct' ? (statusByWork.get(row.id) ?? 'pending') : null;
		const approved =
			row.mode === 'direct'
				? workStatus === 'approved'
				: elementCount > 0 && approvedElements === elementCount;
		return { ...row, elementCount, approvedElements, workStatus, approved };
	});
}

export interface ElementListItem {
	id: string;
	name: string;
	description: string | null;
	sortOrder: number;
	status: TargetStatus;
}

export async function listElementsDetailed(
	db: Database,
	workId: string
): Promise<ElementListItem[]> {
	return db
		.select({
			id: elements.id,
			name: visibleElementName,
			description: elements.description,
			sortOrder: elements.sortOrder,
			status: sql<TargetStatus>`coalesce(${evidenceTargets.currentStatus}, 'pending')`
		})
		.from(elements)
		.leftJoin(catalogItems, eq(catalogItems.id, elements.catalogItemId))
		.leftJoin(evidenceTargets, eq(evidenceTargets.elementId, elements.id))
		.where(eq(elements.workId, workId))
		.orderBy(asc(elements.sortOrder), asc(elements.createdAt));
}

export interface WorkDetail {
	id: string;
	name: string;
	mode: WorkMode;
	description: string | null;
	serviceId: string;
	serviceName: string;
	catalogItemId: string | null;
}

export async function getWorkDetail(db: Database, workId: string): Promise<WorkDetail> {
	const [row] = await db
		.select({
			id: works.id,
			mode: works.mode,
			description: works.description,
			catalogItemId: works.catalogItemId,
			serviceId: works.serviceId,
			serviceName: services.name,
			name: visibleWorkName
		})
		.from(works)
		.innerJoin(services, eq(services.id, works.serviceId))
		.leftJoin(catalogItems, eq(catalogItems.id, works.catalogItemId))
		.where(eq(works.id, workId))
		.limit(1);
	if (!row) throw new DomainError(404, 'Trabajo no encontrado.');
	return row;
}

export interface ElementDetail {
	id: string;
	name: string;
	description: string | null;
	catalogItemId: string | null;
	workId: string;
	workName: string;
	serviceId: string;
	serviceName: string;
}

export async function getElementDetail(db: Database, elementId: string): Promise<ElementDetail> {
	const workCatalog = alias(catalogItems, 'work_catalog');
	const [row] = await db
		.select({
			id: elements.id,
			description: elements.description,
			catalogItemId: elements.catalogItemId,
			workId: works.id,
			workName: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`,
			serviceId: services.id,
			serviceName: services.name,
			name: visibleElementName
		})
		.from(elements)
		.innerJoin(works, eq(works.id, elements.workId))
		.innerJoin(services, eq(services.id, works.serviceId))
		.leftJoin(catalogItems, eq(catalogItems.id, elements.catalogItemId))
		.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
		.where(eq(elements.id, elementId))
		.limit(1);
	if (!row) throw new DomainError(404, 'Elemento no encontrado.');
	return row;
}

export interface WorkProgressItem {
	id: string;
	name: string;
	mode: WorkMode;
	approved: boolean;
	elementCount: number;
	approvedElements: number;
}

export interface ServiceProgress {
	totalTargets: number;
	approvedTargets: number;
	percent: number;
	completed: boolean;
	works: WorkProgressItem[];
}

/**
 * Progreso por servicio en una sola consulta por origen (trabajo directo y
 * elemento), sin N+1. Devuelve un mapa `serviceId -> { total, approved }`.
 */
export async function listServiceProgress(
	db: Database,
	serviceIds: string[]
): Promise<Map<string, { totalTargets: number; approvedTargets: number }>> {
	const result = new Map<string, { totalTargets: number; approvedTargets: number }>();
	if (serviceIds.length === 0) return result;

	const approvedCount = sql<number>`cast(count(*) filter (where ${evidenceTargets.currentStatus} = 'approved') as int)`;

	const [direct, viaElement] = await Promise.all([
		db
			.select({
				serviceId: works.serviceId,
				total: countInt(),
				approved: approvedCount
			})
			.from(evidenceTargets)
			.innerJoin(works, eq(works.id, evidenceTargets.workId))
			.where(inArray(works.serviceId, serviceIds))
			.groupBy(works.serviceId),
		db
			.select({
				serviceId: works.serviceId,
				total: countInt(),
				approved: approvedCount
			})
			.from(evidenceTargets)
			.innerJoin(elements, eq(elements.id, evidenceTargets.elementId))
			.innerJoin(works, eq(works.id, elements.workId))
			.where(inArray(works.serviceId, serviceIds))
			.groupBy(works.serviceId)
	]);

	for (const row of [...direct, ...viaElement]) {
		const current = result.get(row.serviceId) ?? { totalTargets: 0, approvedTargets: 0 };
		current.totalTargets += row.total;
		current.approvedTargets += row.approved;
		result.set(row.serviceId, current);
	}
	return result;
}

/**
 * Progreso derivado (docs/referencia/modelo-datos.md): nunca se persiste. Un servicio se completa si
 * tiene al menos un trabajo y todos están aprobados; un trabajo dividido sin
 * elementos nunca está aprobado.
 */
export async function getServiceProgress(
	db: Database,
	serviceId: string
): Promise<ServiceProgress> {
	const rows = await db
		.select({ id: works.id, mode: works.mode, name: visibleWorkName })
		.from(works)
		.leftJoin(catalogItems, eq(catalogItems.id, works.catalogItemId))
		.where(eq(works.serviceId, serviceId))
		.orderBy(asc(works.sortOrder), asc(works.createdAt));

	if (rows.length === 0) {
		return { totalTargets: 0, approvedTargets: 0, percent: 0, completed: false, works: [] };
	}

	const workIds = rows.map((row) => row.id);
	const elementRows = await db
		.select({ id: elements.id, workId: elements.workId })
		.from(elements)
		.where(inArray(elements.workId, workIds));
	const elementIds = elementRows.map((row) => row.id);

	const directTargets = await db
		.select({ workId: evidenceTargets.workId, status: evidenceTargets.currentStatus })
		.from(evidenceTargets)
		.where(inArray(evidenceTargets.workId, workIds));
	const elementTargets = elementIds.length
		? await db
				.select({ elementId: evidenceTargets.elementId, status: evidenceTargets.currentStatus })
				.from(evidenceTargets)
				.where(inArray(evidenceTargets.elementId, elementIds))
		: [];

	const directStatus = new Map(directTargets.map((row) => [row.workId, row.status]));
	const elementStatus = new Map(elementTargets.map((row) => [row.elementId, row.status]));

	const elementsByWork = new Map<string, string[]>();
	for (const row of elementRows) {
		const list = elementsByWork.get(row.workId) ?? [];
		list.push(row.id);
		elementsByWork.set(row.workId, list);
	}

	let totalTargets = 0;
	let approvedTargets = 0;
	const workProgress: WorkProgressItem[] = [];

	for (const row of rows) {
		if (row.mode === 'direct') {
			const approved = directStatus.get(row.id) === 'approved';
			totalTargets += 1;
			if (approved) approvedTargets += 1;
			workProgress.push({
				id: row.id,
				name: row.name,
				mode: row.mode,
				approved,
				elementCount: 0,
				approvedElements: 0
			});
			continue;
		}

		const ids = elementsByWork.get(row.id) ?? [];
		const approvedElements = ids.filter((id) => elementStatus.get(id) === 'approved').length;
		totalTargets += ids.length;
		approvedTargets += approvedElements;
		workProgress.push({
			id: row.id,
			name: row.name,
			mode: row.mode,
			approved: ids.length > 0 && approvedElements === ids.length,
			elementCount: ids.length,
			approvedElements
		});
	}

	return {
		totalTargets,
		approvedTargets,
		percent: totalTargets === 0 ? 0 : Math.round((approvedTargets / totalTargets) * 100),
		completed: workProgress.length > 0 && workProgress.every((work) => work.approved),
		works: workProgress
	};
}

// Generación masiva (extraída a `works-generation.ts`; se re-exporta aquí).
export { planGeneration, applyGeneration } from './works-generation';
export type {
	GenerationElement,
	GenerationPlan,
	GenerationWork,
	PlanGenerationInput,
	ApplyGenerationInput,
	ApplyGenerationResult
} from './works-generation';
