import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '#lib/server/db';
import { catalogItems, elements, serviceAssignments, services, works } from '#lib/server/db/schema';
import type { SessionUser } from '#lib/types';

/**
 * Búsqueda global por nombre visible actual (docs/02 §12, docs/06 §10).
 * El **ámbito se resuelve en servidor**: administrador (todos) o asignación
 * vigente. Nunca revela recursos ajenos, ni consultando la API sin UI.
 */

export type SearchResultType = 'service' | 'work' | 'element';

export interface SearchResult {
	type: SearchResultType;
	id: string;
	label: string;
	context: string;
	href: string;
}

export interface SearchOptions {
	limit?: number;
	offset?: number;
	/** Tipos a incluir; vacío/undefined = todos. */
	types?: SearchResultType[];
	/** Restringe a un servicio concreto (debe estar en ámbito). */
	serviceId?: string | null;
}

/** `%`/`_`/`\` literales no deben actuar como comodines. */
function likePattern(query: string): string {
	const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
	return `%${escaped}%`;
}

async function allowedServiceIds(db: Database, user: SessionUser): Promise<string[] | null> {
	if (user.role === 'admin') return null;
	const rows = await db
		.select({ serviceId: serviceAssignments.serviceId })
		.from(serviceAssignments)
		.where(and(eq(serviceAssignments.userId, user.id), isNull(serviceAssignments.revokedAt)));
	return [...new Set(rows.map((row) => row.serviceId))];
}

export async function searchByName(
	db: Database,
	user: SessionUser,
	rawQuery: string,
	options: SearchOptions = {}
): Promise<SearchResult[]> {
	const query = rawQuery.trim();
	if (query.length === 0) return [];

	const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
	const offset = Math.max(options.offset ?? 0, 0);
	const fetch = offset + limit;
	const pattern = likePattern(query);

	const allowed = await allowedServiceIds(db, user);
	if (allowed && allowed.length === 0) return [];

	const wanted = options.types && options.types.length > 0 ? options.types : null;
	const serviceFilter = options.serviceId ?? null;
	// Un servicio fuera de ámbito se trata como inexistente (no filtra existencia).
	if (serviceFilter && allowed && !allowed.includes(serviceFilter)) return [];

	const workCatalog = alias(catalogItems, 'work_catalog');
	const elementCatalog = alias(catalogItems, 'element_catalog');

	const serviceRows =
		!wanted || wanted.includes('service')
			? await db
					.select({
						id: services.id,
						label: services.name,
						context: sql<string>`coalesce(${catalogItems.name}, ${services.buildingNameSnapshot}, '')`
					})
					.from(services)
					.leftJoin(catalogItems, eq(catalogItems.id, services.buildingCatalogItemId))
					.where(
						and(
							sql`${services.name} ilike ${pattern} escape '\\'`,
							allowed ? inArray(services.id, allowed) : undefined,
							serviceFilter ? eq(services.id, serviceFilter) : undefined
						)
					)
					.orderBy(asc(services.name))
					.limit(fetch)
			: [];

	const workRows =
		!wanted || wanted.includes('work')
			? await db
					.select({
						id: works.id,
						label: sql<string>`coalesce(${catalogItems.name}, ${works.customName})`,
						serviceId: services.id,
						serviceName: services.name
					})
					.from(works)
					.innerJoin(services, eq(services.id, works.serviceId))
					.leftJoin(catalogItems, eq(catalogItems.id, works.catalogItemId))
					.where(
						and(
							sql`coalesce(${catalogItems.name}, ${works.customName}) ilike ${pattern} escape '\\'`,
							allowed ? inArray(services.id, allowed) : undefined,
							serviceFilter ? eq(services.id, serviceFilter) : undefined
						)
					)
					.orderBy(asc(sql`coalesce(${catalogItems.name}, ${works.customName})`))
					.limit(fetch)
			: [];

	const elementRows =
		!wanted || wanted.includes('element')
			? await db
					.select({
						id: elements.id,
						label: sql<string>`coalesce(${elementCatalog.name}, ${elements.customName})`,
						serviceName: services.name,
						workName: sql<string>`coalesce(${workCatalog.name}, ${works.customName})`
					})
					.from(elements)
					.innerJoin(works, eq(works.id, elements.workId))
					.innerJoin(services, eq(services.id, works.serviceId))
					.leftJoin(elementCatalog, eq(elementCatalog.id, elements.catalogItemId))
					.leftJoin(workCatalog, eq(workCatalog.id, works.catalogItemId))
					.where(
						and(
							sql`coalesce(${elementCatalog.name}, ${elements.customName}) ilike ${pattern} escape '\\'`,
							allowed ? inArray(services.id, allowed) : undefined,
							serviceFilter ? eq(services.id, serviceFilter) : undefined
						)
					)
					.orderBy(asc(sql`coalesce(${elementCatalog.name}, ${elements.customName})`))
					.limit(fetch)
			: [];

	const results: SearchResult[] = [
		...serviceRows.map((row) => ({
			type: 'service' as const,
			id: row.id,
			label: row.label,
			context: row.context,
			href: `/services/${row.id}`
		})),
		...workRows.map((row) => ({
			type: 'work' as const,
			id: row.id,
			label: row.label,
			context: row.serviceName,
			href: `/works/${row.id}`
		})),
		...elementRows.map((row) => ({
			type: 'element' as const,
			id: row.id,
			label: row.label,
			context: `${row.serviceName} · ${row.workName}`,
			href: `/elements/${row.id}`
		}))
	];

	results.sort((a, b) => a.label.localeCompare(b.label, 'es'));
	return results.slice(offset, offset + limit);
}
