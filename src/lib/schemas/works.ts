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
		.default(''),
	/** Elementos del trabajo dividido, serializados como JSON (ver `createWorkElementSchema`). */
	elements: z.string().optional().default('[]'),
	/** Requisitos del trabajo (o de cada elemento), serializados como JSON. */
	requirements: z.string().optional().default('[]'),
	requirementIsRequired: z.enum(['true', 'false']).optional().default('true')
});

/** Elemento definido en el modal de creación del trabajo dividido. */
export const createWorkElementSchema = z
	.object({
		name: z
			.string()
			.trim()
			.max(120, 'El nombre no puede superar 120 caracteres.')
			.optional()
			.default(''),
		catalogItemId: z
			.union([z.uuid('Ítem inválido.'), z.literal('')])
			.optional()
			.default('')
	})
	.refine((data) => Boolean(data.catalogItemId) !== data.name.length > 0, {
		message: 'Cada elemento debe tener un ítem de catálogo o un nombre propio (exactamente uno).'
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

const conversionElementSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'El nombre del elemento es obligatorio.')
		.max(120, 'El nombre no puede superar 120 caracteres.'),
	catalogItemId: z
		.union([z.uuid('Ítem inválido.'), z.null()])
		.optional()
		.default(null)
});

/**
 * Cuerpo de la conversión de modo. En `divided` exige reasignar explícitamente
 * todos los requisitos y fotos adicionales a un elemento; en `direct` exige
 * confirmar el conjunto completo que se reasigna al objetivo directo.
 */
export const convertWorkModeSchema = z.discriminatedUnion('targetMode', [
	z.object({
		targetMode: z.literal('divided'),
		elements: z.array(conversionElementSchema).min(1, 'Añade al menos un elemento.'),
		requirements: z.array(
			z.object({ requirementId: z.uuid(), elementIndex: z.number().int().min(0) })
		),
		additionalPhotos: z.array(
			z.object({ photoId: z.uuid(), elementIndex: z.number().int().min(0) })
		)
	}),
	z.object({
		targetMode: z.literal('direct'),
		requirements: z.array(z.uuid()),
		additionalPhotos: z.array(z.uuid())
	})
]);
