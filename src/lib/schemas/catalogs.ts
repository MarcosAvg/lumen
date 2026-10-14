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

export const catalogPurposeSchema = z
	.union([z.enum(['general', 'buildings', 'requirements']), z.literal('')])
	.optional()
	.default('');

export const createCatalogSchema = z.object({
	name: catalogNameSchema,
	description: catalogDescriptionSchema,
	purpose: catalogPurposeSchema
});

export const updateCatalogSchema = z.object({
	catalogId: z.uuid('Catálogo inválido.'),
	name: catalogNameSchema,
	description: catalogDescriptionSchema,
	purpose: catalogPurposeSchema
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

export const createRelationsBatchSchema = z.object({
	fromItemIds: z
		.array(z.uuid('Ítem de origen inválido.'))
		.min(1, 'Elige al menos un ítem de origen.'),
	toItemIds: z
		.array(z.uuid('Ítem de destino inválido.'))
		.min(1, 'Elige al menos un ítem de destino.'),
	relationType: z
		.string()
		.trim()
		.max(80, 'El tipo no puede superar 80 caracteres.')
		.optional()
		.default('')
});
