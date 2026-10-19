import { and, eq } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import {
	catalogBuildings,
	catalogItems,
	catalogTypes,
	catalogs,
	services
} from '#lib/server/db/schema';
import { DomainError } from './errors';

/**
 * Un catálogo global está disponible en todos los servicios. Uno restringido
 * solo aparece cuando el edificio del servicio está entre sus edificios.
 */
export async function assertCatalogItemAvailableForService(
	db: Database,
	serviceId: string,
	catalogItemId: string
): Promise<void> {
	const [row] = await db
		.select({
			allBuildings: catalogs.allBuildings,
			typeSystemRole: catalogTypes.systemRole,
			serviceBuildingId: services.buildingCatalogItemId,
			scopeBuildingId: catalogBuildings.buildingCatalogItemId
		})
		.from(catalogItems)
		.innerJoin(catalogs, eq(catalogs.id, catalogItems.catalogId))
		.innerJoin(catalogTypes, eq(catalogTypes.id, catalogs.typeId))
		.innerJoin(services, eq(services.id, serviceId))
		.leftJoin(
			catalogBuildings,
			and(
				eq(catalogBuildings.catalogId, catalogs.id),
				eq(catalogBuildings.buildingCatalogItemId, services.buildingCatalogItemId)
			)
		)
		.where(eq(catalogItems.id, catalogItemId))
		.limit(1);

	if (!row) throw new DomainError(404, 'Ítem de catálogo no encontrado.');
	if (row.typeSystemRole === 'building') {
		throw new DomainError(
			400,
			'El ítem pertenece al catálogo de edificios y no puede nombrar evidencia.'
		);
	}
	if (row.allBuildings) return;
	if (!row.serviceBuildingId || !row.scopeBuildingId) {
		throw new DomainError(409, 'El catálogo no está disponible para el edificio de este servicio.');
	}
}

/** El edificio del servicio debe venir de un catálogo cuyo tipo sea Edificio. */
export async function assertBuildingCatalogItem(
	db: Database,
	catalogItemId: string
): Promise<void> {
	const [row] = await db
		.select({ id: catalogItems.id })
		.from(catalogItems)
		.innerJoin(catalogs, eq(catalogs.id, catalogItems.catalogId))
		.innerJoin(catalogTypes, eq(catalogTypes.id, catalogs.typeId))
		.where(and(eq(catalogItems.id, catalogItemId), eq(catalogTypes.systemRole, 'building')))
		.limit(1);
	if (!row) {
		throw new DomainError(400, 'El edificio debe pertenecer a un catálogo de tipo Edificio.');
	}
}
