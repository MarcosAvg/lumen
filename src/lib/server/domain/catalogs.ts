import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { getPgErrorCode } from '#lib/server/db/errors';
import {
	catalogItemRelations,
	catalogItems,
	catalogs,
	elements,
	photoRequirements,
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

export interface CatalogItemImpact {
	works: number;
	elements: number;
	services: number;
	requirements: number;
}

const VALID_PURPOSES: CatalogPurpose[] = ['general', 'buildings', 'requirements'];

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

function likePattern(raw: string): string {
	return `%${raw.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function listCatalogs(db: Database, query?: string): Promise<CatalogSummary[]> {
	const q = query?.trim();
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
		.where(q ? sql`${catalogs.name} ilike ${likePattern(q)} escape '\\'` : undefined)
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
		.update(photoRequirements)
		.set({ customName: itemName, catalogItemId: null, updatedAt: new Date() })
		.where(eq(photoRequirements.catalogItemId, itemId));
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
	const [requirementsCount] = await db
		.select({ value: countInt() })
		.from(photoRequirements)
		.where(eq(photoRequirements.catalogItemId, itemId));

	return {
		works: worksCount?.value ?? 0,
		elements: elementsCount?.value ?? 0,
		services: servicesCount?.value ?? 0,
		requirements: requirementsCount?.value ?? 0
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

/** Metadatos del catálogo sin cargar todos sus ítems (para vistas paginadas). */
export async function getCatalogMeta(
	db: Database,
	catalogId: string
): Promise<GetCatalogResult['catalog']> {
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
	return catalog;
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

/** Recuento de usos por ítem (trabajos, elementos y edificios de servicio). */
async function getCatalogItemsUsage(
	db: Database,
	itemIds: string[]
): Promise<Map<string, CatalogItemImpact>> {
	const map = new Map<string, CatalogItemImpact>();
	if (itemIds.length === 0) return map;
	for (const id of itemIds) map.set(id, { works: 0, elements: 0, services: 0, requirements: 0 });

	const workRows = await db
		.select({ itemId: works.catalogItemId, value: countInt() })
		.from(works)
		.where(inArray(works.catalogItemId, itemIds))
		.groupBy(works.catalogItemId);
	const elementRows = await db
		.select({ itemId: elements.catalogItemId, value: countInt() })
		.from(elements)
		.where(inArray(elements.catalogItemId, itemIds))
		.groupBy(elements.catalogItemId);
	const serviceRows = await db
		.select({ itemId: services.buildingCatalogItemId, value: countInt() })
		.from(services)
		.where(inArray(services.buildingCatalogItemId, itemIds))
		.groupBy(services.buildingCatalogItemId);
	const requirementRows = await db
		.select({ itemId: photoRequirements.catalogItemId, value: countInt() })
		.from(photoRequirements)
		.where(inArray(photoRequirements.catalogItemId, itemIds))
		.groupBy(photoRequirements.catalogItemId);

	for (const [rows, key] of [
		[workRows, 'works'],
		[elementRows, 'elements'],
		[serviceRows, 'services'],
		[requirementRows, 'requirements']
	] as const) {
		for (const row of rows) {
			if (!row.itemId) continue;
			const entry = map.get(row.itemId);
			if (entry) entry[key] = row.value;
		}
	}
	return map;
}

export interface CatalogItemSearchResult {
	id: string;
	name: string;
	sortOrder: number;
	impact: CatalogItemImpact;
}

export interface CatalogItemsPage {
	items: CatalogItemSearchResult[];
	total: number;
}

/** Ítems de un catálogo con búsqueda, paginación y usos. */
export async function searchCatalogItems(
	db: Database,
	catalogId: string,
	options: { q?: string; limit?: number; offset?: number } = {}
): Promise<CatalogItemsPage> {
	const q = options.q?.trim();
	const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
	const offset = Math.max(options.offset ?? 0, 0);
	const condition = q
		? and(
				eq(catalogItems.catalogId, catalogId),
				sql`${catalogItems.name} ilike ${likePattern(q)} escape '\\'`
			)
		: eq(catalogItems.catalogId, catalogId);

	const items = await db
		.select({ id: catalogItems.id, name: catalogItems.name, sortOrder: catalogItems.sortOrder })
		.from(catalogItems)
		.where(condition)
		.orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name))
		.limit(limit)
		.offset(offset);
	const [totalRow] = await db.select({ value: countInt() }).from(catalogItems).where(condition);
	const usage = await getCatalogItemsUsage(
		db,
		items.map((item) => item.id)
	);

	return {
		items: items.map((item) => ({
			...item,
			impact: usage.get(item.id) ?? { works: 0, elements: 0, services: 0, requirements: 0 }
		})),
		total: totalRow?.value ?? 0
	};
}

export interface MoveCatalogItemInput {
	itemId: string;
	direction: -1 | 1;
	actorId: string;
}

/** Mueve un ítem arriba/abajo dentro de su catálogo y normaliza el orden. */
export async function moveCatalogItem(db: Database, input: MoveCatalogItemInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [item] = await tx
			.select({ id: catalogItems.id, catalogId: catalogItems.catalogId })
			.from(catalogItems)
			.where(eq(catalogItems.id, input.itemId))
			.limit(1);
		if (!item) throw new DomainError(404, 'Ítem no encontrado.');

		const rows = await tx
			.select({ id: catalogItems.id })
			.from(catalogItems)
			.where(eq(catalogItems.catalogId, item.catalogId))
			.orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name));
		const index = rows.findIndex((row) => row.id === input.itemId);
		const target = index + input.direction;
		if (target < 0 || target >= rows.length) return;

		const reordered = [...rows];
		const [moved] = reordered.splice(index, 1);
		reordered.splice(target, 0, moved);

		let order = 0;
		for (const row of reordered) {
			await tx
				.update(catalogItems)
				.set({ sortOrder: order, updatedAt: new Date() })
				.where(eq(catalogItems.id, row.id));
			order += 1;
		}

		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'catalog',
			entityId: item.catalogId,
			action: 'catalog_items.reordered'
		});
	});
}

export interface ItemOption {
	id: string;
	name: string;
	catalogId: string;
	catalogName: string;
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

// Relaciones de catálogo (extraídas a `catalog-relations.ts`; se re-exportan aquí).
export {
	createRelation,
	createRelationsBatch,
	deleteRelation,
	listRelationsForCatalog
} from './catalog-relations';
export type {
	CatalogRelationRow,
	CreateRelationInput,
	CreateRelationsBatchInput,
	CreateRelationsBatchResult
} from './catalog-relations';
