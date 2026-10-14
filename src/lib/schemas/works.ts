import { z } from 'zod';

export const workModeSchema = z.enum(['direct', 'divided'], { message: 'Modo inválido.' });

const optionalCatalogItem = z
	.union([z.uuid('Ítem inválido.'), z.literal('')])
	.optional()
	.default('');

export const createWorkSchema = z.object({
	serviceId: z.uuid('Servicio inválido.'),
	mode: workModeSchema,
	name: z
		.string()
		.trim()
		.max(120, 'El nombre no puede superar 120 caracteres.')
		.optional()
		.default(''),
	catalogItemId: optionalCatalogItem,
	description: z
		.string()
		.trim()
		.max(2000, 'La descripción no puede superar 2000 caracteres.')
		.optional()
		.default('')
});

export const createElementSchema = z.object({
	workId: z.uuid('Trabajo inválido.'),
	name: z
		.string()
		.trim()
		.max(120, 'El nombre no puede superar 120 caracteres.')
		.optional()
		.default(''),
	catalogItemId: optionalCatalogItem,
	description: z
		.string()
		.trim()
		.max(2000, 'La descripción no puede superar 2000 caracteres.')
		.optional()
		.default('')
});

export const updateWorkSchema = z.object({
	workId: z.uuid('Trabajo inválido.'),
	name: z
		.string()
		.trim()
		.min(1, 'El nombre es obligatorio.')
		.max(120, 'El nombre no puede superar 120 caracteres.'),
	description: z
		.string()
		.trim()
		.max(2000, 'La descripción no puede superar 2000 caracteres.')
		.optional()
		.default('')
});

export const updateElementSchema = z.object({
	elementId: z.uuid('Elemento inválido.'),
	name: z
		.string()
		.trim()
		.min(1, 'El nombre es obligatorio.')
		.max(120, 'El nombre no puede superar 120 caracteres.'),
	description: z
		.string()
		.trim()
		.max(2000, 'La descripción no puede superar 2000 caracteres.')
		.optional()
		.default('')
});
