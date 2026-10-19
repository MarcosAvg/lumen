/** Ítem de catálogo para los selectores. */
export interface CatalogItemRef {
	id: string;
	name: string;
}

/** Catálogo con sus ítems, base de la selección en dos pasos. */
export interface CatalogGroup {
	id: string;
	name: string;
	description?: string | null;
	typeId?: string;
	typeName?: string;
	typeSystemRole?: 'building' | null;
	typeSortOrder?: number;
	allBuildings?: boolean;
	buildingIds?: string[];
	items: CatalogItemRef[];
}

/** Elemento en construcción: por ítem de catálogo o por nombre propio. */
export interface ElementDraft {
	catalogItemId: string;
	name: string;
}

/** Requisito en construcción: por ítem de catálogo de requisitos o por nombre propio. */
export interface RequirementDraft {
	catalogItemId: string;
	name: string;
}
