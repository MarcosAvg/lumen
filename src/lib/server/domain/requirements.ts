import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
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
			name: photoRequirements.name,
			isRequired: photoRequirements.isRequired,
			sortOrder: photoRequirements.sortOrder
		})
		.from(photoRequirements)
		.where(eq(photoRequirements.targetId, targetId))
		.orderBy(asc(photoRequirements.sortOrder), asc(photoRequirements.createdAt));
}

export interface CreateRequirementInput {
	targetId: string;
	name: string;
	isRequired: boolean;
	actorId: string;
}

export async function createRequirement(
	db: Database,
	input: CreateRequirementInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		await assertRequirementsEditable(tx, input.targetId);

		const [next] = await tx
			.select({ value: sql<number>`coalesce(max(${photoRequirements.sortOrder}), -1) + 1` })
			.from(photoRequirements)
			.where(eq(photoRequirements.targetId, input.targetId));

		const [created] = await tx
			.insert(photoRequirements)
			.values({
				targetId: input.targetId,
				name: input.name,
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
			metadata: { targetId: input.targetId, name: input.name }
		});

		return { id: created.id };
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
			.select({ id: photoRequirements.id, targetId: photoRequirements.targetId })
			.from(photoRequirements)
			.where(eq(photoRequirements.id, input.requirementId))
			.limit(1);
		if (!requirement) throw new DomainError(404, 'Requisito no encontrado.');

		await assertRequirementsEditable(tx, requirement.targetId);

		await tx
			.update(photoRequirements)
			.set({ name: input.name, isRequired: input.isRequired, updatedAt: new Date() })
			.where(eq(photoRequirements.id, input.requirementId));

		await bumpVersion(tx, requirement.targetId);
		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'photo_requirement',
			entityId: input.requirementId,
			action: 'requirement.updated'
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
