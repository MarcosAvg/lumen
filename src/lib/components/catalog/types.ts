/** Ítem de catálogo para los selectores. */
export interface CatalogItemRef {
	id: string;
	name: string;
}

/** Catálogo con sus ítems, base de la selección en dos pasos. */
export interface CatalogGroup {
	id: string;
	name: string;
	items: CatalogItemRef[];
}
