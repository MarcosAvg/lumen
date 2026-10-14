import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	catalogItems,
	catalogs,
	evidenceSubmissions,
	evidenceTargets,
	photoRequirements,
	photos
} from '#lib/server/db/schema';
import { recordAudit } from './audit';
import { DomainError } from './errors';
import { getTargetContext, isEditableStatus } from './targets';

export interface RequirementRow {
	id: string;
	name: string;
	isRequired: boolean;
	sortOrder: number;
	catalogItemId: string | null;
}

/** Nombre visible del requisito: catálogo (dinámico) o propio. */
const visibleRequirementName = sql<string>`coalesce(${catalogItems.name}, ${photoRequirements.customName})`;

/**
 * Resuelve el origen del nombre de un requisito: o un ítem de un catálogo de
 * propósito `requirements`, o un nombre propio. Exactamente uno.
 */
async function resolveNameSource(
	db: Database,
	source: { catalogItemId?: string | null; name?: string | null }
): Promise<{ catalogItemId: string | null; customName: string | null }> {
	const hasCatalog = Boolean(source.catalogItemId);
	const custom = source.name?.trim() ?? '';
	const hasCustom = custom.length > 0;

	if (hasCatalog === hasCustom) {
		throw new DomainError(
			400,
			'Debes indicar un ítem de catálogo de requisitos o un nombre (exactamente uno).'
		);
	}

	if (hasCatalog) {
		const [item] = await db
			.select({ id: catalogItems.id })
			.from(catalogItems)
			.innerJoin(catalogs, eq(catalogs.id, catalogItems.catalogId))
			.where(
				and(
					eq(catalogItems.id, source.catalogItemId as string),
					eq(catalogs.purpose, 'requirements')
				)
			)
			.limit(1);
		if (!item) throw new DomainError(404, 'Ítem de catálogo de requisitos no encontrado.');
		return { catalogItemId: item.id, customName: null };
	}

	return { catalogItemId: null, customName: custom };
}

/**
 * Comprueba si el objetivo tiene envíos (para congelar requisitos tras el primero).
 */
export async function hasSubmissions(db: Database, targetId: string): Promise<boolean> {
	const rows = await db
		.select({ id: evidenceSubmissions.id })
		.from(evidenceSubmissions)
		.where(eq(evidenceSubmissions.targetId, targetId))
		.limit(1);
	return rows.length > 0;
}

/**
 * Los requisitos solo pueden modificarse mientras la evidencia sea editable y el
 * objetivo **nunca se haya enviado** (docs/01 §6).
 */
export async function assertRequirementsEditable(db: Database, targetId: string): Promise<void> {
	const target = await getTargetContext(db, targetId);
	if (!isEditableStatus(target.status)) {
		throw new DomainError(409, 'La evidencia no es editable en su estado actual.');
	}
	if (await hasSubmissions(db, targetId)) {
		throw new DomainError(409, 'Los requisitos quedaron congelados tras el primer envío.');
	}
}

async function bumpVersion(tx: Database, targetId: string): Promise<void> {
	await tx
		.update(evidenceTargets)
		.set({ version: sql`${evidenceTargets.version} + 1`, updatedAt: new Date() })
		.where(eq(evidenceTargets.id, targetId));
}

export async function listRequirements(db: Database, targetId: string): Promise<RequirementRow[]> {
	return db
		.select({
			id: photoRequirements.id,
			name: visibleRequirementName,
			isRequired: photoRequirements.isRequired,
			sortOrder: photoRequirements.sortOrder,
			catalogItemId: photoRequirements.catalogItemId
		})
		.from(photoRequirements)
		.leftJoin(catalogItems, eq(catalogItems.id, photoRequirements.catalogItemId))
		.where(eq(photoRequirements.targetId, targetId))
		.orderBy(asc(photoRequirements.sortOrder), asc(photoRequirements.createdAt));
}

export interface CreateRequirementInput {
	targetId: string;
	catalogItemId?: string | null;
	name?: string | null;
	isRequired: boolean;
	actorId: string;
}

export async function createRequirement(
	db: Database,
	input: CreateRequirementInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		await assertRequirementsEditable(tx, input.targetId);
		const source = await resolveNameSource(tx, input);

		const [next] = await tx
			.select({ value: sql<number>`coalesce(max(${photoRequirements.sortOrder}), -1) + 1` })
			.from(photoRequirements)
			.where(eq(photoRequirements.targetId, input.targetId));

		const [created] = await tx
			.insert(photoRequirements)
			.values({
				targetId: input.targetId,
				catalogItemId: source.catalogItemId,
				customName: source.customName,
				isRequired: input.isRequired,
				sortOrder: next?.value ?? 0
			})
			.returning({ id: photoRequirements.id });

		await bumpVersion(tx, input.targetId);
		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'photo_requirement',
			entityId: created.id,
			action: 'requirement.created',
			metadata: {
				targetId: input.targetId,
				catalogItemId: source.catalogItemId,
				name: source.customName
			}
		});

		return { id: created.id };
	});
}

export interface RequirementInput {
	catalogItemId?: string | null;
	name?: string | null;
}

export interface InsertRequirementsResult {
	created: number;
	skipped: number;
	requirements: RequirementRow[];
}

/**
 * Inserta requisitos (ítem de catálogo de requisitos o nombre propio) en un
 * target, omitiendo duplicados por nombre. Debe invocarse dentro de una
 * transacción sobre un target ya validado (creación o edición permitida).
 */
export async function insertRequirements(
	tx: Database,
	input: { targetId: string; requirements: RequirementInput[]; isRequired: boolean }
): Promise<InsertRequirementsResult> {
	if (input.requirements.length === 0) {
		return { created: 0, skipped: 0, requirements: [] };
	}

	// Resuelve el origen y el nombre visible de cada entrada.
	const resolved: { catalogItemId: string | null; name: string }[] = [];
	for (const draft of input.requirements) {
		const source = await resolveNameSource(tx, draft);
		let name = source.customName ?? '';
		if (source.catalogItemId) {
			const [item] = await tx
				.select({ name: catalogItems.name })
				.from(catalogItems)
				.where(eq(catalogItems.id, source.catalogItemId))
				.limit(1);
			name = item?.name ?? '';
		}
		resolved.push({ catalogItemId: source.catalogItemId, name });
	}

	const existing = await tx
		.select({ name: visibleRequirementName })
		.from(photoRequirements)
		.leftJoin(catalogItems, eq(catalogItems.id, photoRequirements.catalogItemId))
		.where(eq(photoRequirements.targetId, input.targetId));
	const taken = new Set(existing.map((row) => row.name.trim().toLowerCase()));

	const [base] = await tx
		.select({ value: sql<number>`coalesce(max(${photoRequirements.sortOrder}), -1) + 1` })
		.from(photoRequirements)
		.where(eq(photoRequirements.targetId, input.targetId));
	let order = base?.value ?? 0;

	let created = 0;
	const createdRows: RequirementRow[] = [];
	for (const entry of resolved) {
		const key = entry.name.trim().toLowerCase();
		if (taken.has(key)) continue;
		taken.add(key);
		const [inserted] = await tx
			.insert(photoRequirements)
			.values({
				targetId: input.targetId,
				catalogItemId: entry.catalogItemId,
				customName: entry.catalogItemId ? null : entry.name,
				isRequired: input.isRequired,
				sortOrder: order
			})
			.returning({ id: photoRequirements.id, sortOrder: photoRequirements.sortOrder });
		createdRows.push({
			id: inserted.id,
			name: entry.name,
			isRequired: input.isRequired,
			sortOrder: inserted.sortOrder,
			catalogItemId: entry.catalogItemId
		});
		order += 1;
		created += 1;
	}

	return { created, skipped: resolved.length - created, requirements: createdRows };
}

export interface CreateRequirementsBatchInput {
	targetId: string;
	catalogItemIds: string[];
	isRequired: boolean;
	actorId: string;
}

export interface CreateRequirementsBatchResult {
	created: number;
	skipped: number;
	requirements: RequirementRow[];
}

/**
 * Añade varios requisitos desde un catálogo de requisitos en una transacción,
 * omitiendo los que ya existen por nombre (sin distinguir mayúsculas).
 */
export async function createRequirementsBatch(
	db: Database,
	input: CreateRequirementsBatchInput
): Promise<CreateRequirementsBatchResult> {
	const catalogItemIds = [...new Set(input.catalogItemIds)];
	if (catalogItemIds.length === 0) {
		throw new DomainError(400, 'Elige al menos un ítem de requisito.');
	}

	return db.transaction(async (tx) => {
		await assertRequirementsEditable(tx, input.targetId);

		const result = await insertRequirements(tx, {
			targetId: input.targetId,
			requirements: catalogItemIds.map((catalogItemId) => ({ catalogItemId })),
			isRequired: input.isRequired
		});

		if (result.created > 0) {
			await bumpVersion(tx, input.targetId);
			await recordAudit(tx, {
				actorUserId: input.actorId,
				entityType: 'photo_requirement',
				entityId: input.targetId,
				action: 'requirements.batch_created',
				metadata: { created: result.created, skipped: result.skipped }
			});
		}

		return result;
	});
}

export interface UpdateRequirementInput {
	requirementId: string;
	name: string;
	isRequired: boolean;
	actorId: string;
}

export async function updateRequirement(
	db: Database,
	input: UpdateRequirementInput
): Promise<void> {
	await db.transaction(async (tx) => {
		const [requirement] = await tx
			.select({
				id: photoRequirements.id,
				targetId: photoRequirements.targetId,
				catalogItemId: photoRequirements.catalogItemId,
				catalogName: catalogItems.name
			})
			.from(photoRequirements)
			.leftJoin(catalogItems, eq(catalogItems.id, photoRequirements.catalogItemId))
			.where(eq(photoRequirements.id, input.requirementId))
			.limit(1);
		if (!requirement) throw new DomainError(404, 'Requisito no encontrado.');

		await assertRequirementsEditable(tx, requirement.targetId);

		const newName = input.name.trim();
		if (!newName) throw new DomainError(400, 'El nombre del requisito es obligatorio.');
		// Si el requisito está ligado y el nombre no cambia, conserva el vínculo.
		const keepsLink = Boolean(requirement.catalogItemId) && requirement.catalogName === newName;

		await tx
			.update(photoRequirements)
			.set({
				catalogItemId: keepsLink ? requirement.catalogItemId : null,
				customName: keepsLink ? null : newName,
				isRequired: input.isRequired,
				updatedAt: new Date()
			})
			.where(eq(photoRequirements.id, input.requirementId));

		await bumpVersion(tx, requirement.targetId);
		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'photo_requirement',
			entityId: input.requirementId,
			action: 'requirement.updated',
			metadata: { unlinked: Boolean(requirement.catalogItemId) && !keepsLink }
		});
	});
}

export interface DeleteRequirementInput {
	requirementId: string;
	actorId: string;
}

/**
 * Elimina un requisito antes del primer envío moviendo sus fotos a **Adicionales**
 * (única excepción al bloqueo de traslado), preservando orden y autoría.
 */
export async function deleteRequirement(
	db: Database,
	input: DeleteRequirementInput
): Promise<void> {
	await db.transaction(async (tx) => {
		const [requirement] = await tx
			.select({ id: photoRequirements.id, targetId: photoRequirements.targetId })
			.from(photoRequirements)
			.where(eq(photoRequirements.id, input.requirementId))
			.limit(1);
		if (!requirement) throw new DomainError(404, 'Requisito no encontrado.');

		await assertRequirementsEditable(tx, requirement.targetId);

		const currentPhotos = await tx
			.select({ id: photos.id, sortOrder: photos.sortOrder })
			.from(photos)
			.where(
				sql`${photos.targetId} = ${requirement.targetId} and ${photos.requirementId} = ${input.requirementId} and ${photos.removedAt} is null`
			)
			.orderBy(asc(photos.sortOrder), asc(photos.uploadedAt));

		const [base] = await tx
			.select({ value: sql<number>`coalesce(max(${photos.sortOrder}), -1) + 1` })
			.from(photos)
			.where(
				sql`${photos.targetId} = ${requirement.targetId} and ${photos.requirementId} is null and ${photos.removedAt} is null`
			);

		let order = base?.value ?? 0;
		for (const photo of currentPhotos) {
			await tx
				.update(photos)
				.set({ requirementId: null, sortOrder: order })
				.where(eq(photos.id, photo.id));
			order += 1;
		}

		await tx.delete(photoRequirements).where(eq(photoRequirements.id, input.requirementId));
		await bumpVersion(tx, requirement.targetId);
		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'photo_requirement',
			entityId: input.requirementId,
			action: 'requirement.deleted',
			metadata: { movedPhotos: currentPhotos.length }
		});
	});
}

export interface ReorderRequirementsInput {
	targetId: string;
	orderedIds: string[];
	actorId: string;
}

export async function reorderRequirements(
	db: Database,
	input: ReorderRequirementsInput
): Promise<void> {
	await db.transaction(async (tx) => {
		await assertRequirementsEditable(tx, input.targetId);

		const current = await tx
			.select({ id: photoRequirements.id })
			.from(photoRequirements)
			.where(eq(photoRequirements.targetId, input.targetId));

		const currentIds = new Set(current.map((row) => row.id));
		if (
			currentIds.size !== input.orderedIds.length ||
			!input.orderedIds.every((id) => currentIds.has(id))
		) {
			throw new DomainError(409, 'El conjunto de requisitos cambió. Actualiza la página.');
		}

		let order = 0;
		for (const id of input.orderedIds) {
			await tx
				.update(photoRequirements)
				.set({ sortOrder: order, updatedAt: new Date() })
				.where(eq(photoRequirements.id, id));
			order += 1;
		}

		await bumpVersion(tx, input.targetId);
		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'photo_requirement',
			entityId: input.targetId,
			action: 'requirements.reordered'
		});
	});
}

export async function countRequirements(db: Database, targetId: string): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`cast(count(*) as int)` })
		.from(photoRequirements)
		.where(eq(photoRequirements.targetId, targetId));
	return row?.value ?? 0;
}
