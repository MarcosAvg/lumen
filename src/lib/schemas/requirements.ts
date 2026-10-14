import { z } from 'zod';

const requirementNameSchema = z
	.string()
	.trim()
	.min(1, 'El nombre del requisito es obligatorio.')
	.max(120, 'El nombre no puede superar 120 caracteres.');

/** Alta individual: o un ítem de catálogo de requisitos o un nombre propio. */
export const createRequirementBodySchema = z
	.object({
		catalogItemId: z.uuid('Ítem de catálogo inválido.').optional(),
		name: requirementNameSchema.optional(),
		isRequired: z.boolean().optional().default(true)
	})
	.refine((value) => Boolean(value.catalogItemId) !== Boolean(value.name), {
		message: 'Indica un ítem de catálogo o un nombre (exactamente uno).'
	});

export const createRequirementsBatchSchema = z.object({
	catalogItemIds: z.array(z.uuid('Ítem de catálogo inválido.')).min(1, 'Elige al menos un ítem.'),
	isRequired: z.boolean().optional().default(true)
});

export const updateRequirementBodySchema = z.object({
	name: requirementNameSchema,
	isRequired: z.boolean().optional().default(true)
});

/** Requisito en construcción: por ítem de catálogo de requisitos o por nombre propio. */
export const requirementDraftSchema = z
	.object({
		catalogItemId: z
			.union([z.uuid('Ítem inválido.'), z.literal('')])
			.optional()
			.default(''),
		name: z
			.string()
			.trim()
			.max(120, 'El nombre no puede superar 120 caracteres.')
			.optional()
			.default('')
	})
	.refine((data) => Boolean(data.catalogItemId) !== data.name.length > 0, {
		message: 'Cada requisito debe tener un ítem de catálogo o un nombre propio (exactamente uno).'
	});
