import { describe, expect, it } from 'vitest';
import {
	createRequirementBodySchema,
	createRequirementsBatchSchema,
	requirementDraftSchema,
	updateRequirementBodySchema
} from './requirements';

const ITEM = '11111111-1111-4111-8111-111111111111';

describe('requisitos (validación)', () => {
	it('acepta un nombre propio o un ítem de catálogo, nunca ambos', () => {
		expect(createRequirementBodySchema.safeParse({ name: 'Antes' }).success).toBe(true);
		expect(createRequirementBodySchema.safeParse({ catalogItemId: ITEM }).success).toBe(true);
		expect(
			createRequirementBodySchema.safeParse({ name: 'Antes', catalogItemId: ITEM }).success
		).toBe(false);
		expect(createRequirementBodySchema.safeParse({}).success).toBe(false);
	});

	it('el lote exige al menos un ítem y asume obligatorio', () => {
		const parsed = createRequirementsBatchSchema.safeParse({ catalogItemIds: [ITEM] });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.isRequired).toBe(true);

		expect(createRequirementsBatchSchema.safeParse({ catalogItemIds: [] }).success).toBe(false);
		expect(createRequirementsBatchSchema.safeParse({ catalogItemIds: ['no-uuid'] }).success).toBe(
			false
		);
	});

	it('el renombrado exige un nombre no vacío', () => {
		expect(updateRequirementBodySchema.safeParse({ name: 'Antes' }).success).toBe(true);
		expect(updateRequirementBodySchema.safeParse({ name: '   ' }).success).toBe(false);
	});

	it('el borrador de requisito acepta catálogo o nombre, nunca ambos', () => {
		expect(requirementDraftSchema.safeParse({ catalogItemId: ITEM }).success).toBe(true);
		expect(requirementDraftSchema.safeParse({ name: 'Antes' }).success).toBe(true);
		expect(requirementDraftSchema.safeParse({ catalogItemId: ITEM, name: 'Antes' }).success).toBe(
			false
		);
		expect(requirementDraftSchema.safeParse({}).success).toBe(false);
	});
});
