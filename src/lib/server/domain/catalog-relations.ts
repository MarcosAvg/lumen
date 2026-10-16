import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import { getPgErrorCode } from '#lib/server/db/errors';
import { catalogItemRelations, catalogItems } from '#lib/server/db/schema';
import { recordAudit } from './audit';
import { DomainError } from './errors';

/**
 * Relaciones entre ítems de catálogos distintos (por ítem y en lote).
 * Extraído de `catalogs.ts` para separar responsabilidades; se re-exporta desde allí.
 */

export interface CatalogRelationRow {
	id: string;
	fromItemId: string;
	fromName: string;
	fromCatalogId: string;
	toItemId: string;
	toName: string;
	toCatalogId: string;
	relationType: string | null;
}

async function assertItemsInDifferentCatalogs(
	tx: Database,
	fromItemId: string,
	toItemId: string
): Promise<void> {
	const rows = await tx
		.select({ id: catalogItems.id, catalogId: catalogItems.catalogId })
		.from(catalogItems)
		.where(inArray(catalogItems.id, [fromItemId, toItemId]));
	const from = rows.find((row) => row.id === fromItemId);
	const to = rows.find((row) => row.id === toItemId);
	if (!from || !to) throw new DomainError(404, 'Ítem de catálogo no encontrado.');
	if (from.catalogId === to.catalogId) {
		throw new DomainError(409, 'La relación debe enlazar ítems de catálogos distintos.');
	}
}

export interface CreateRelationInput {
	fromItemId: string;
	toItemId: string;
	relationType?: string | null;
	actorId: string;
}

export async function createRelation(
	db: Database,
	input: CreateRelationInput
): Promise<{ id: string }> {
	if (input.fromItemId === input.toItemId) {
		throw new DomainError(409, 'No se puede relacionar un ítem consigo mismo.');
	}

	try {
		return await db.transaction(async (tx) => {
			await assertItemsInDifferentCatalogs(tx, input.fromItemId, input.toItemId);

			const [created] = await tx
				.insert(catalogItemRelations)
				.values({
					fromItemId: input.fromItemId,
					toItemId: input.toItemId,
					relationType: input.relationType?.trim() || null
				})
				.returning({ id: catalogItemRelations.id });

			await recordAudit(tx, {
				actorUserId: input.actorId,
				entityType: 'catalog_item_relation',
				entityId: created.id,
				action: 'catalog_relation.created',
				metadata: { fromItemId: input.fromItemId, toItemId: input.toItemId }
			});

			return { id: created.id };
		});
	} catch (error) {
		if (getPgErrorCode(error) === '23505') {
			throw new DomainError(409, 'Esa relación ya existe.');
		}
		throw error;
	}
}

export interface CreateRelationsBatchInput {
	fromItemIds: string[];
	toItemIds: string[];
	relationType?: string | null;
	actorId: string;
}

export interface CreateRelationsBatchResult {
	created: number;
	skipped: number;
}

/** Relaciona en lote (producto de ambos conjuntos) omitiendo pares ya existentes. */
export async function createRelationsBatch(
	db: Database,
	input: CreateRelationsBatchInput
): Promise<CreateRelationsBatchResult> {
	const fromItemIds = [...new Set(input.fromItemIds)];
	const toItemIds = [...new Set(input.toItemIds)];
	const relationType = input.relationType?.trim() || null;

	if (fromItemIds.length === 0 || toItemIds.length === 0) {
		throw new DomainError(400, 'Selecciona al menos un ítem en cada lado.');
	}

	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ id: catalogItems.id, catalogId: catalogItems.catalogId })
			.from(catalogItems)
			.where(inArray(catalogItems.id, [...fromItemIds, ...toItemIds]));
		const catalogByItem = new Map(rows.map((row) => [row.id, row.catalogId]));
		for (const id of [...fromItemIds, ...toItemIds]) {
			if (!catalogByItem.has(id)) throw new DomainError(404, 'Ítem de catálogo no encontrado.');
		}

		const pairs: { fromItemId: string; toItemId: string }[] = [];
		for (const fromItemId of fromItemIds) {
			const fromCatalogId = catalogByItem.get(fromItemId);
			for (const toItemId of toItemIds) {
				if (fromItemId === toItemId) continue;
				if (catalogByItem.get(toItemId) === fromCatalogId) {
					throw new DomainError(409, 'La relación debe enlazar ítems de catálogos distintos.');
				}
				pairs.push({ fromItemId, toItemId });
			}
		}
		if (pairs.length === 0) throw new DomainError(400, 'No hay relaciones que crear.');

		const existingRows = await tx
			.select({
				fromItemId: catalogItemRelations.fromItemId,
				toItemId: catalogItemRelations.toItemId,
				relationType: catalogItemRelations.relationType
			})
			.from(catalogItemRelations)
			.where(
				and(
					inArray(catalogItemRelations.fromItemId, fromItemIds),
					inArray(catalogItemRelations.toItemId, toItemIds)
				)
			);
		const existingKeys = new Set(
			existingRows
				.filter((row) => (row.relationType ?? null) === relationType)
				.map((row) => `${row.fromItemId}:${row.toItemId}`)
		);

		const pending = pairs.filter(
			(pair) => !existingKeys.has(`${pair.fromItemId}:${pair.toItemId}`)
		);

		let created = 0;
		if (pending.length > 0) {
			const inserted = await tx
				.insert(catalogItemRelations)
				.values(
					pending.map((pair) => ({
						fromItemId: pair.fromItemId,
						toItemId: pair.toItemId,
						relationType
					}))
				)
				.onConflictDoNothing()
				.returning({ id: catalogItemRelations.id });
			created = inserted.length;
		}

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'catalog_item_relation',
			action: 'catalog_relations.batch_created',
			metadata: { fromItemIds, toItemIds, relationType, created, skipped: pairs.length - created }
		});

		return { created, skipped: pairs.length - created };
	});
}

export async function deleteRelation(
	db: Database,
	relationId: string,
	actorId: string
): Promise<void> {
	await db.transaction(async (tx) => {
		const [deleted] = await tx
			.delete(catalogItemRelations)
			.where(eq(catalogItemRelations.id, relationId))
			.returning({ id: catalogItemRelations.id });
		if (!deleted) throw new DomainError(404, 'Relación no encontrada.');

		await recordAudit(tx, {
			actorUserId: actorId,
			entityType: 'catalog_item_relation',
			entityId: relationId,
			action: 'catalog_relation.deleted'
		});
	});
}

/** Relaciones que involucran ítems de un catálogo (asociaciones hacia otros catálogos). */
export async function listRelationsForCatalog(
	db: Database,
	catalogId: string
): Promise<CatalogRelationRow[]> {
	const itemIds = await db
		.select({ id: catalogItems.id })
		.from(catalogItems)
		.where(eq(catalogItems.catalogId, catalogId));
	if (itemIds.length === 0) return [];

	const ids = itemIds.map((row) => row.id);
	const fromItem = alias(catalogItems, 'from_item');
	const toItem = alias(catalogItems, 'to_item');

	return db
		.select({
			id: catalogItemRelations.id,
			fromItemId: catalogItemRelations.fromItemId,
			fromName: fromItem.name,
			fromCatalogId: fromItem.catalogId,
			toItemId: catalogItemRelations.toItemId,
			toName: toItem.name,
			toCatalogId: toItem.catalogId,
			relationType: catalogItemRelations.relationType
		})
		.from(catalogItemRelations)
		.innerJoin(fromItem, eq(fromItem.id, catalogItemRelations.fromItemId))
		.innerJoin(toItem, eq(toItem.id, catalogItemRelations.toItemId))
		.where(
			or(inArray(catalogItemRelations.fromItemId, ids), inArray(catalogItemRelations.toItemId, ids))
		)
		.orderBy(asc(catalogItemRelations.createdAt));
}
