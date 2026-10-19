import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { getPgErrorCode } from '#lib/server/db/errors';
import {
	catalogBuildings,
	catalogItems,
	catalogTypes,
	catalogs,
	elements,
	photoRequirements,
	services,
	works
} from '#lib/server/db/schema';
import { recordAudit } from './audit';
import { DomainError } from './errors';

export interface CatalogTypeSummary {
	id: string;
	name: string;
	systemRole: 'building' | null;
	sortOrder: number;
	catalogCount: number;
}

export interface CatalogSummary {
	id: string;
	name: string;
	description: string | null;
	typeId: string;
	typeName: string;
	typeSystemRole: 'building' | null;
	typeSortOrder: number;
	allBuildings: boolean;
	buildingIds: string[];
	buildingNames: string[];
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

function countInt() {
	return sql<number>`cast(count(*) as int)`;
}

function likePattern(raw: string): string {
	return `%${raw.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

async function catalogScopes(
	db: Database,
	catalogIds: string[]
): Promise<Map<string, { ids: string[]; names: string[] }>> {
	const result = new Map<string, { ids: string[]; names: string[] }>();
	if (catalogIds.length === 0) return result;
	const rows = await db
		.select({
			catalogId: catalogBuildings.catalogId,
			buildingId: catalogBuildings.buildingCatalogItemId,
			buildingName: catalogItems.name
		})
		.from(catalogBuildings)
		.innerJoin(catalogItems, eq(catalogItems.id, catalogBuildings.buildingCatalogItemId))
		.where(inArray(catalogBuildings.catalogId, catalogIds))
		.orderBy(asc(catalogItems.name));

	for (const row of rows) {
		const entry = result.get(row.catalogId) ?? { ids: [], names: [] };
		entry.ids.push(row.buildingId);
		entry.names.push(row.buildingName);
		result.set(row.catalogId, entry);
	}
	return result;
}

export async function listCatalogTypes(db: Database): Promise<CatalogTypeSummary[]> {
	const rows = await db
		.select({
			id: catalogTypes.id,
			name: catalogTypes.name,
			systemRole: catalogTypes.systemRole,
			sortOrder: catalogTypes.sortOrder,
			catalogCount: sql<number>`cast(count(${catalogs.id}) as int)`
		})
		.from(catalogTypes)
		.leftJoin(catalogs, eq(catalogs.typeId, catalogTypes.id))
		.groupBy(catalogTypes.id)
		.orderBy(asc(catalogTypes.sortOrder), asc(catalogTypes.name));
	return rows;
}

export async function listCatalogs(db: Database, query?: string): Promise<CatalogSummary[]> {
	const q = query?.trim();
	const rows = await db
		.select({
			id: catalogs.id,
			name: catalogs.name,
			description: catalogs.description,
			typeId: catalogs.typeId,
			typeName: catalogTypes.name,
			typeSystemRole: catalogTypes.systemRole,
			typeSortOrder: catalogTypes.sortOrder,
			allBuildings: catalogs.allBuildings,
			itemCount: sql<number>`cast(count(${catalogItems.id}) as int)`
		})
		.from(catalogs)
		.innerJoin(catalogTypes, eq(catalogTypes.id, catalogs.typeId))
		.leftJoin(catalogItems, eq(catalogItems.catalogId, catalogs.id))
		.where(q ? sql`${catalogs.name} ilike ${likePattern(q)} escape '\\'` : undefined)
		.groupBy(catalogs.id, catalogTypes.id)
		.orderBy(asc(catalogTypes.sortOrder), asc(catalogs.sortOrder), asc(catalogs.name));

	const scopes = await catalogScopes(
		db,
		rows.map((row) => row.id)
	);
	return rows.map((row) => {
		const scope = scopes.get(row.id);
		return {
			...row,
			buildingIds: scope?.ids ?? [],
			buildingNames: scope?.names ?? []
		};
	});
}

async function assertCatalogType(db: Database, typeId: string): Promise<void> {
	const [type] = await db
		.select({ id: catalogTypes.id })
		.from(catalogTypes)
		.where(eq(catalogTypes.id, typeId))
		.limit(1);
	if (!type) throw new DomainError(400, 'Tipo de catálogo inválido.');
}

async function defaultCatalogTypeId(db: Database): Promise<string> {
	const [other] = await db
		.select({ id: catalogTypes.id })
		.from(catalogTypes)
		.where(
			and(isNull(catalogTypes.systemRole), sql`lower(${catalogTypes.name}) in ('otro', 'otros')`)
		)
		.limit(1);
	if (other) return other.id;
	const [first] = await db
		.select({ id: catalogTypes.id })
		.from(catalogTypes)
		.where(isNull(catalogTypes.systemRole))
		.orderBy(asc(catalogTypes.sortOrder), asc(catalogTypes.name))
		.limit(1);
	if (!first) throw new DomainError(500, 'No hay tipos de catálogo configurados.');
	return first.id;
}

async function assertBuildingItems(db: Database, buildingIds: string[]): Promise<void> {
	if (buildingIds.length === 0) return;
	const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	if (buildingIds.some((id) => !uuid.test(id))) {
		throw new DomainError(400, 'La selección de edificios contiene un identificador inválido.');
	}
	const rows = await db
		.select({ id: catalogItems.id })
		.from(catalogItems)
		.innerJoin(catalogs, eq(catalogs.id, catalogItems.catalogId))
		.innerJoin(catalogTypes, eq(catalogTypes.id, catalogs.typeId))
		.where(and(inArray(catalogItems.id, buildingIds), eq(catalogTypes.systemRole, 'building')));
	if (rows.length !== new Set(buildingIds).size) {
		throw new DomainError(
			400,
			'Todos los edificios deben pertenecer a un catálogo de tipo Edificio.'
		);
	}
}

async function replaceCatalogBuildings(
	tx: Database,
	catalogId: string,
	allBuildings: boolean,
	buildingIds: string[]
): Promise<void> {
	await tx.delete(catalogBuildings).where(eq(catalogBuildings.catalogId, catalogId));
	if (allBuildings || buildingIds.length === 0) return;
	await tx
		.insert(catalogBuildings)
		.values([...new Set(buildingIds)].map((id) => ({ catalogId, buildingCatalogItemId: id })));
}

export interface CreateCatalogInput {
	name: string;
	description?: string | null;
	/** Si se omite, se usa el tipo «Otro». */
	typeId?: string;
	allBuildings?: boolean;
	buildingCatalogItemIds?: string[];
	actorId: string;
}

export async function createCatalog(
	db: Database,
	input: CreateCatalogInput
): Promise<{ id: string }> {
	const typeId = input.typeId ?? (await defaultCatalogTypeId(db));
	return db.transaction(async (tx) => {
		await assertCatalogType(tx, typeId);
		const allBuildings = input.allBuildings ?? true;
		const buildingIds = input.buildingCatalogItemIds ?? [];
		if (!allBuildings && buildingIds.length === 0) {
			throw new DomainError(400, 'Selecciona al menos un edificio o marca «Todos los edificios».');
		}
		await assertBuildingItems(tx, buildingIds);

		const [created] = await tx
			.insert(catalogs)
			.values({
				name: input.name,
				description: input.description?.trim() || null,
				typeId,
				allBuildings
			})
			.returning({ id: catalogs.id });

		await replaceCatalogBuildings(tx, created.id, allBuildings, buildingIds);
		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'catalog',
			entityId: created.id,
			action: 'catalog.created',
			metadata: { name: input.name, typeId, allBuildings }
		});

		return { id: created.id };
	});
}

export interface UpdateCatalogInput {
	catalogId: string;
	name: string;
	description?: string | null;
	typeId: string;
	allBuildings?: boolean;
	buildingCatalogItemIds?: string[];
	actorId: string;
}

export async function updateCatalog(db: Database, input: UpdateCatalogInput): Promise<void> {
	await db.transaction(async (tx) => {
		await assertCatalogType(tx, input.typeId);
		const allBuildings = input.allBuildings ?? true;
		const buildingIds = input.buildingCatalogItemIds ?? [];
		if (!allBuildings && buildingIds.length === 0) {
			throw new DomainError(400, 'Selecciona al menos un edificio o marca «Todos los edificios».');
		}
		await assertBuildingItems(tx, buildingIds);

		const [updated] = await tx
			.update(catalogs)
			.set({
				name: input.name,
				description: input.description?.trim() || null,
				typeId: input.typeId,
				allBuildings,
				updatedAt: new Date()
			})
			.where(eq(catalogs.id, input.catalogId))
			.returning({ id: catalogs.id });
		if (!updated) throw new DomainError(404, 'Catálogo no encontrado.');

		await replaceCatalogBuildings(tx, input.catalogId, allBuildings, buildingIds);
		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'catalog',
			entityId: input.catalogId,
			action: 'catalog.updated',
			metadata: { name: input.name, typeId: input.typeId, allBuildings }
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

export async function createCatalogType(
	db: Database,
	input: { name: string; sortOrder?: number; actorId: string }
): Promise<{ id: string }> {
	try {
		return await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(catalogTypes)
				.values({ name: input.name, sortOrder: input.sortOrder ?? 0 })
				.returning({ id: catalogTypes.id });
			await recordAudit(tx, {
				actorUserId: input.actorId,
				entityType: 'catalog_type',
				entityId: created.id,
				action: 'catalog_type.created',
				metadata: { name: input.name }
			});
			return { id: created.id };
		});
	} catch (error) {
		if (getPgErrorCode(error) === '23505') {
			throw new DomainError(409, 'Ya existe un tipo de catálogo con ese nombre.');
		}
		throw error;
	}
}

export async function updateCatalogType(
	db: Database,
	input: { typeId: string; name: string; sortOrder?: number; actorId: string }
): Promise<void> {
	try {
		await db.transaction(async (tx) => {
			const [updated] = await tx
				.update(catalogTypes)
				.set({
					name: input.name,
					sortOrder: input.sortOrder ?? 0,
					updatedAt: new Date()
				})
				.where(eq(catalogTypes.id, input.typeId))
				.returning({ id: catalogTypes.id });
			if (!updated) throw new DomainError(404, 'Tipo de catálogo no encontrado.');
			await recordAudit(tx, {
				actorUserId: input.actorId,
				entityType: 'catalog_type',
				entityId: input.typeId,
				action: 'catalog_type.updated',
				metadata: { name: input.name }
			});
		});
	} catch (error) {
		if (getPgErrorCode(error) === '23505') {
			throw new DomainError(409, 'Ya existe un tipo de catálogo con ese nombre.');
		}
		throw error;
	}
}

export async function deleteCatalogType(
	db: Database,
	input: { typeId: string; actorId: string }
): Promise<void> {
	await db.transaction(async (tx) => {
		const [type] = await tx
			.select({ id: catalogTypes.id, name: catalogTypes.name, systemRole: catalogTypes.systemRole })
			.from(catalogTypes)
			.where(eq(catalogTypes.id, input.typeId))
			.limit(1);
		if (!type) throw new DomainError(404, 'Tipo de catálogo no encontrado.');
		if (type.systemRole === 'building') {
			throw new DomainError(409, 'El tipo Edificio es necesario para los servicios.');
		}
		const [used] = await tx
			.select({ value: countInt() })
			.from(catalogs)
			.where(eq(catalogs.typeId, input.typeId));
		if ((used?.value ?? 0) > 0) {
			throw new DomainError(409, 'No se puede eliminar un tipo que tiene catálogos.');
		}
		await tx.delete(catalogTypes).where(eq(catalogTypes.id, input.typeId));
		await recordAudit(tx, {
			actorUserId: input.actorId,
			entityType: 'catalog_type',
			entityId: input.typeId,
			action: 'catalog_type.deleted',
			metadata: { name: type.name }
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

export interface CatalogMeta {
	id: string;
	name: string;
	description: string | null;
	typeId: string;
	typeName: string;
	typeSystemRole: 'building' | null;
	allBuildings: boolean;
	buildingIds: string[];
	buildingNames: string[];
}

export interface GetCatalogResult {
	catalog: CatalogMeta;
	items: CatalogItemRow[];
}

export async function getCatalog(db: Database, catalogId: string): Promise<GetCatalogResult> {
	return {
		catalog: await getCatalogMeta(db, catalogId),
		items: await listCatalogItemOptions(db, catalogId)
	};
}

/** Metadatos del catálogo sin cargar todos sus ítems (para vistas paginadas). */
export async function getCatalogMeta(db: Database, catalogId: string): Promise<CatalogMeta> {
	const [catalog] = await db
		.select({
			id: catalogs.id,
			name: catalogs.name,
			description: catalogs.description,
			typeId: catalogs.typeId,
			typeName: catalogTypes.name,
			typeSystemRole: catalogTypes.systemRole,
			allBuildings: catalogs.allBuildings
		})
		.from(catalogs)
		.innerJoin(catalogTypes, eq(catalogTypes.id, catalogs.typeId))
		.where(eq(catalogs.id, catalogId))
		.limit(1);
	if (!catalog) throw new DomainError(404, 'Catálogo no encontrado.');
	const scope = (await catalogScopes(db, [catalogId])).get(catalogId);
	return {
		...catalog,
		buildingIds: scope?.ids ?? [],
		buildingNames: scope?.names ?? []
	};
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
	description: string | null;
	typeId: string;
	typeName: string;
	typeSystemRole: 'building' | null;
	typeSortOrder: number;
	allBuildings: boolean;
	buildingIds: string[];
	items: { id: string; name: string }[];
}

/** Catálogos con sus ítems, para selectores de edificio/generación. */
export async function listCatalogsWithItems(db: Database): Promise<CatalogWithItems[]> {
	const rows = await db
		.select({
			catalogId: catalogs.id,
			catalogName: catalogs.name,
			catalogDescription: catalogs.description,
			typeId: catalogs.typeId,
			typeName: catalogTypes.name,
			typeSystemRole: catalogTypes.systemRole,
			typeSortOrder: catalogTypes.sortOrder,
			allBuildings: catalogs.allBuildings,
			itemId: catalogItems.id,
			itemName: catalogItems.name
		})
		.from(catalogs)
		.innerJoin(catalogTypes, eq(catalogTypes.id, catalogs.typeId))
		.leftJoin(catalogItems, eq(catalogItems.catalogId, catalogs.id))
		.orderBy(
			asc(catalogTypes.sortOrder),
			asc(catalogs.sortOrder),
			asc(catalogs.name),
			asc(catalogItems.sortOrder),
			asc(catalogItems.name)
		);

	const map = new Map<string, CatalogWithItems>();
	for (const row of rows) {
		let entry = map.get(row.catalogId);
		if (!entry) {
			entry = {
				id: row.catalogId,
				name: row.catalogName,
				description: row.catalogDescription,
				typeId: row.typeId,
				typeName: row.typeName,
				typeSystemRole: row.typeSystemRole,
				typeSortOrder: row.typeSortOrder,
				allBuildings: row.allBuildings,
				buildingIds: [],
				items: []
			};
			map.set(row.catalogId, entry);
		}
		if (row.itemId && row.itemName) entry.items.push({ id: row.itemId, name: row.itemName });
	}
	const scopes = await catalogScopes(db, [...map.keys()]);
	for (const [id, scope] of scopes) {
		const entry = map.get(id);
		if (entry) entry.buildingIds = scope.ids;
	}
	return [...map.values()];
}

/**
 * Filtra catálogos visibles para un edificio: globales o limitados a él.
 * Se usa en cargas de servicio y también en las escrituras.
 */
export function filterCatalogsAvailableForBuilding(
	catalogs: CatalogWithItems[],
	buildingId: string | null
): CatalogWithItems[] {
	return catalogs.filter(
		(catalog) =>
			catalog.allBuildings || (buildingId !== null && catalog.buildingIds.includes(buildingId))
	);
}

export async function listCatalogsAvailableForService(
	db: Database,
	serviceId: string
): Promise<CatalogWithItems[]> {
	const [service] = await db
		.select({ buildingId: services.buildingCatalogItemId })
		.from(services)
		.where(eq(services.id, serviceId))
		.limit(1);
	if (!service) throw new DomainError(404, 'Servicio no encontrado.');
	return filterCatalogsAvailableForBuilding(await listCatalogsWithItems(db), service.buildingId);
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
