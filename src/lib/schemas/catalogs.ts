import { z } from 'zod';

export const catalogNameSchema = z
	.string()
	.trim()
	.min(1, 'El nombre del catálogo es obligatorio.')
	.max(120, 'El nombre no puede superar 120 caracteres.');

export const catalogDescriptionSchema = z
	.string()
	.trim()
	.max(2000, 'La descripción no puede superar 2000 caracteres.')
	.optional()
	.default('');

export const catalogTypeNameSchema = z
	.string()
	.trim()
	.min(1, 'El nombre del tipo es obligatorio.')
	.max(80, 'El nombre no puede superar 80 caracteres.');

export const catalogSortOrderSchema = z.coerce
	.number()
	.int('El orden debe ser un número entero.')
	.min(0, 'El orden no puede ser negativo.')
	.optional()
	.default(0);

export const createCatalogSchema = z.object({
	name: catalogNameSchema,
	description: catalogDescriptionSchema,
	typeId: z.uuid('Tipo de catálogo inválido.'),
	allBuildings: z
		.enum(['true', 'false'], { message: 'Ámbito de edificios inválido.' })
		.optional()
		.default('true')
});

export const updateCatalogSchema = createCatalogSchema.extend({
	catalogId: z.uuid('Catálogo inválido.')
});

export const createCatalogTypeSchema = z.object({
	name: catalogTypeNameSchema,
	sortOrder: catalogSortOrderSchema
});

export const updateCatalogTypeSchema = z.object({
	typeId: z.uuid('Tipo de catálogo inválido.'),
	name: catalogTypeNameSchema,
	sortOrder: catalogSortOrderSchema
});

export const deleteCatalogTypeSchema = z.object({
	typeId: z.uuid('Tipo de catálogo inválido.')
});

export const catalogIdSchema = z.object({
	catalogId: z.uuid('Catálogo inválido.')
});

export const createCatalogItemSchema = z.object({
	catalogId: z.uuid('Catálogo inválido.'),
	name: z
		.string()
		.trim()
		.min(1, 'El nombre del ítem es obligatorio.')
		.max(120, 'El nombre no puede superar 120 caracteres.')
});

export const renameCatalogItemSchema = z.object({
	itemId: z.uuid('Ítem inválido.'),
	name: z
		.string()
		.trim()
		.min(1, 'El nombre del ítem es obligatorio.')
		.max(120, 'El nombre no puede superar 120 caracteres.')
});

export const deleteCatalogItemSchema = z.object({
	itemId: z.uuid('Ítem inválido.')
});
