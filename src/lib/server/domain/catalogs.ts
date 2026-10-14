import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import { getPgErrorCode } from '#lib/server/db/errors';
import {
	catalogItemRelations,
	catalogItems,
	catalogs,
	elements,
	services,
	works
} from '#lib/server/db/schema';
import type { CatalogPurpose } from '#lib/types';
import { recordAudit } from './audit';
import { DomainError } from './errors';

export interface CatalogSummary {
	id: string;
	name: string;
	description: string | null;
	purpose: CatalogPurpose | null;
	itemCount: number;
}

export interface CatalogItemRow {
	id: string;
	name: string;
	sortOrder: number;
}

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

export interface CatalogItemImpact {
	works: number;
	elements: number;
	services: number;
}

const VALID_PURPOSES: CatalogPurpose[] = ['general', 'buildings'];

function normalizePurpose(purpose: string | null | undefined): CatalogPurpose | null {
	if (!purpose) return null;
	if (!VALID_PURPOSES.includes(purpose as CatalogPurpose)) {
		throw new DomainError(400, 'Propósito de catálogo inválido.');
	}
	return purpose as CatalogPurpose;
}

function countInt() {
	return sql<number>`cast(count(*) as int)`;
}

export async function listCatalogs(db: Database): Promise<CatalogSummary[]> {
	return db
		.select({
			id: catalogs.id,
			name: catalogs.name,
			description: catalogs.description,
			purpose: catalogs.purpose,
			itemCount: sql<number>`cast(count(${catalogItems.id}) as int)`
		})
		.from(catalogs)
		.leftJoin(catalogItems, eq(catalogItems.catalogId, catalogs.id))
		.groupBy(catalogs.id)
		.orderBy(asc(catalogs.sortOrder), asc(catalogs.name));
}

export interface CreateCatalogInput {
	name: string;
	description?: string | null;
	purpose?: string | null;
	actorId: string;
}

export async function createCatalog(
	db: Database,
	input: CreateCatalogInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const [created] = await tx
			.insert(catalogs)
			.values({
				name: input.name,
				description: input.description?.trim() || null,
				purpose: normalizePurpose(input.purpose)
			})
			.returning({ id: catalogs.id });

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'catalog',
			entityId: created.id,
			action: 'catalog.created',
			metadata: { name: input.name }
		});

		return { id: created.id };
	});
}

export interface UpdateCatalogInput {
	catalogId: string;
	name: string;
	description?: string | null;
	purpose?: string | null;
	actorId: string;
}

export async function updateCatalog(db: Database, input: UpdateCatalogInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(catalogs)
			.set({
				name: input.name,
				description: input.description?.trim() || null,
				purpose: normalizePurpose(input.purpose),
				updatedAt: new Date()
			})
			.where(eq(catalogs.id, input.catalogId))
			.returning({ id: catalogs.id });
		if (!updated) throw new DomainError(404, 'Catálogo no encontrado.');

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'catalog',
			entityId: input.catalogId,
			action: 'catalog.updated',
			metadata: { name: input.name }
		});
	});
}

/** Desvincula preservando el nombre en todas las instancias (sin borrar evidencia). */
async function detachCatalogItem(tx: Database, itemId: string, itemName: string): Promise<void> {
	await tx
		.update(works)
		.set({ customName: itemName, catalogItemId: null, updatedAt: new Date() })
		.where(eq(works.catalogItemId, itemId));
	await tx
		.update(elements)
		.set({ customName: itemName, catalogItemId: null, updatedAt: new Date() })
		.where(eq(elements.catalogItemId, itemId));
	await tx
		.update(services)
		.set({ buildingNameSnapshot: itemName, buildingCatalogItemId: null, updatedAt: new Date() })
		.where(eq(services.buildingCatalogItemId, itemId));
	await tx
		.delete(catalogItemRelations)
		.where(
			or(eq(catalogItemRelations.fromItemId, itemId), eq(catalogItemRelations.toItemId, itemId))
		);
}

export async function getCatalogItemImpact(
	db: Database,
	itemId: string
): Promise<CatalogItemImpact> {
	const [worksCount] = await db
		.select({ value: countInt() })
		.from(works)
		.where(eq(works.catalogItemId, itemId));
	const [elementsCount] = await db
		.select({ value: countInt() })
		.from(elements)
		.where(eq(elements.catalogItemId, itemId));
	const [servicesCount] = await db
		.select({ value: countInt() })
		.from(services)
		.where(eq(services.buildingCatalogItemId, itemId));

	return {
		works: worksCount?.value ?? 0,
		elements: elementsCount?.value ?? 0,
		services: servicesCount?.value ?? 0
	};
}

export interface DeleteCatalogItemInput {
	itemId: string;
	actorId: string;
}

/**
 * Elimina un ítem de catálogo de forma **preservadora**: copia su último nombre a
 * las instancias vinculadas, las desvincula, borra relaciones y el ítem. Nunca
 * borra trabajos, elementos, servicios, fotos ni revisiones.
 */
export async function deleteCatalogItem(
	db: Database,
	input: DeleteCatalogItemInput
): Promise<void> {
	await db.transaction(async (tx) => {
		const [item] = await tx
			.select({ id: catalogItems.id, name: catalogItems.name, catalogId: catalogItems.catalogId })
			.from(catalogItems)
			.where(eq(catalogItems.id, input.itemId))
			.limit(1);
		if (!item) throw new DomainError(404, 'Ítem de catálogo no encontrado.');

		await detachCatalogItem(tx, item.id, item.name);
		await tx.delete(catalogItems).where(eq(catalogItems.id, item.id));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'catalog_item',
			entityId: item.id,
			action: 'catalog_item.deleted',
			metadata: { name: item.name, catalogId: item.catalogId }
		});
	});
}

export interface DeleteCatalogInput {
	catalogId: string;
	actorId: string;
}

/** Elimina un catálogo preservando los nombres de todos sus ítems vinculados. */
export async function deleteCatalog(db: Database, input: DeleteCatalogInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [catalog] = await tx
			.select({ id: catalogs.id, name: catalogs.name })
			.from(catalogs)
			.where(eq(catalogs.id, input.catalogId))
			.limit(1);
		if (!catalog) throw new DomainError(404, 'Catálogo no encontrado.');

		const items = await tx
			.select({ id: catalogItems.id, name: catalogItems.name })
			.from(catalogItems)
			.where(eq(catalogItems.catalogId, input.catalogId));

		for (const item of items) {
			await detachCatalogItem(tx, item.id, item.name);
		}

		await tx.delete(catalogs).where(eq(catalogs.id, input.catalogId));

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'catalog',
			entityId: input.catalogId,
			action: 'catalog.deleted',
			metadata: { name: catalog.name, itemsDetached: items.length }
		});
	});
}

export interface GetCatalogResult {
	catalog: { id: string; name: string; description: string | null; purpose: CatalogPurpose | null };
	items: CatalogItemRow[];
}

export async function getCatalog(db: Database, catalogId: string): Promise<GetCatalogResult> {
	const [catalog] = await db
		.select({
			id: catalogs.id,
			name: catalogs.name,
			description: catalogs.description,
			purpose: catalogs.purpose
		})
		.from(catalogs)
		.where(eq(catalogs.id, catalogId))
		.limit(1);
	if (!catalog) throw new DomainError(404, 'Catálogo no encontrado.');

	return { catalog, items: await listCatalogItemOptions(db, catalogId) };
}

export async function listCatalogItemOptions(
	db: Database,
	catalogId: string
): Promise<CatalogItemRow[]> {
	return db
		.select({ id: catalogItems.id, name: catalogItems.name, sortOrder: catalogItems.sortOrder })
		.from(catalogItems)
		.where(eq(catalogItems.catalogId, catalogId))
		.orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name));
}

export interface ItemOption {
	id: string;
	name: string;
	catalogId: string;
	catalogName: string;
}

/** Ítems de todos los catálogos (opcionalmente excluyendo uno), para selectores. */
export async function listAllItemOptions(
	db: Database,
	excludeCatalogId?: string
): Promise<ItemOption[]> {
	const rows = await db
		.select({
			id: catalogItems.id,
			name: catalogItems.name,
			catalogId: catalogItems.catalogId,
			catalogName: catalogs.name
		})
		.from(catalogItems)
		.innerJoin(catalogs, eq(catalogs.id, catalogItems.catalogId))
		.orderBy(asc(catalogs.name), asc(catalogItems.sortOrder), asc(catalogItems.name));

	return excludeCatalogId ? rows.filter((row) => row.catalogId !== excludeCatalogId) : rows;
}

export interface CatalogWithItems {
	id: string;
	name: string;
	purpose: CatalogPurpose | null;
	items: { id: string; name: string }[];
}

/** Catálogos con sus ítems, para selectores de edificio/generación. */
export async function listCatalogsWithItems(db: Database): Promise<CatalogWithItems[]> {
	const rows = await db
		.select({
			catalogId: catalogs.id,
			catalogName: catalogs.name,
			purpose: catalogs.purpose,
			itemId: catalogItems.id,
			itemName: catalogItems.name,
			itemSort: catalogItems.sortOrder
		})
		.from(catalogs)
		.leftJoin(catalogItems, eq(catalogItems.catalogId, catalogs.id))
		.orderBy(
			asc(catalogs.sortOrder),
			asc(catalogs.name),
			asc(catalogItems.sortOrder),
			asc(catalogItems.name)
		);

	const map = new Map<string, CatalogWithItems>();
	for (const row of rows) {
		let entry = map.get(row.catalogId);
		if (!entry) {
			entry = { id: row.catalogId, name: row.catalogName, purpose: row.purpose, items: [] };
			map.set(row.catalogId, entry);
		}
		if (row.itemId && row.itemName) entry.items.push({ id: row.itemId, name: row.itemName });
	}
	return [...map.values()];
}

export interface CreateCatalogItemInput {
	catalogId: string;
	name: string;
	actorId: string;
}

export async function createCatalogItem(
	db: Database,
	input: CreateCatalogItemInput
): Promise<{ id: string }> {
	try {
		return await db.transaction(async (tx) => {
			const [catalog] = await tx
				.select({ id: catalogs.id })
				.from(catalogs)
				.where(eq(catalogs.id, input.catalogId))
				.limit(1);
			if (!catalog) throw new DomainError(404, 'Catálogo no encontrado.');

			const [next] = await tx
				.select({ value: sql<number>`coalesce(max(${catalogItems.sortOrder}), -1) + 1` })
				.from(catalogItems)
				.where(eq(catalogItems.catalogId, input.catalogId));

			const [created] = await tx
				.insert(catalogItems)
				.values({ catalogId: input.catalogId, name: input.name, sortOrder: next?.value ?? 0 })
				.returning({ id: catalogItems.id });

			await recordAudit(tx, {
				actorUserId: input.actorId,
				entityType: 'catalog_item',
				entityId: created.id,
				action: 'catalog_item.created',
				metadata: { name: input.name, catalogId: input.catalogId }
			});

			return { id: created.id };
		});
	} catch (error) {
		if (getPgErrorCode(error) === '23505') {
			throw new DomainError(409, 'Ya existe un ítem con ese nombre en el catálogo.');
		}
		throw error;
	}
}

export interface RenameCatalogItemInput {
	itemId: string;
	name: string;
	actorId: string;
}

/** Renombra el ítem maestro: los objetos aún vinculados muestran el nuevo nombre. */
export async function renameCatalogItem(
	db: Database,
	input: RenameCatalogItemInput
): Promise<void> {
	try {
		await db.transaction(async (tx) => {
			const [updated] = await tx
				.update(catalogItems)
				.set({ name: input.name, updatedAt: new Date() })
				.where(eq(catalogItems.id, input.itemId))
				.returning({ id: catalogItems.id, catalogId: catalogItems.catalogId });
			if (!updated) throw new DomainError(404, 'Ítem de catálogo no encontrado.');

			await recordAudit(tx, {
				actorUserId: input.actorId,
				entityType: 'catalog_item',
				entityId: input.itemId,
				action: 'catalog_item.renamed',
				metadata: { name: input.name, catalogId: updated.catalogId }
			});
		});
	} catch (error) {
		if (getPgErrorCode(error) === '23505') {
			throw new DomainError(409, 'Ya existe un ítem con ese nombre en el catálogo.');
		}
		throw error;
	}
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

	return db.transaction(async (tx) => {
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

/** Relaciones entre dos ítems concretos (usadas para expandir generación). */
export async function listRelationsBetweenItems(
	db: Database,
	fromItemIds: string[],
	toItemIds: string[]
): Promise<{ fromItemId: string; toItemId: string }[]> {
	if (fromItemIds.length === 0 || toItemIds.length === 0) return [];
	return db
		.select({
			fromItemId: catalogItemRelations.fromItemId,
			toItemId: catalogItemRelations.toItemId
		})
		.from(catalogItemRelations)
		.where(
			and(
				inArray(catalogItemRelations.fromItemId, fromItemIds),
				inArray(catalogItemRelations.toItemId, toItemIds)
			)
		);
}
