import { describe, expect, it } from 'vitest';
import { createRelationsBatchSchema } from './catalogs';

const ITEM = '11111111-1111-4111-8111-111111111111';
const ITEM2 = '22222222-2222-4222-8222-222222222222';

describe('relaciones de catálogo en lote (validación)', () => {
	it('exige al menos un ítem en cada lado', () => {
		expect(
			createRelationsBatchSchema.safeParse({ fromItemIds: [], toItemIds: [ITEM] }).success
		).toBe(false);
		expect(
			createRelationsBatchSchema.safeParse({ fromItemIds: [ITEM], toItemIds: [] }).success
		).toBe(false);
	});

	it('acepta varios ítems y normaliza el tipo opcional', () => {
		const parsed = createRelationsBatchSchema.safeParse({
			fromItemIds: [ITEM, ITEM2],
			toItemIds: [ITEM]
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.relationType).toBe('');
		}
	});

	it('rechaza identificadores que no son uuid', () => {
		expect(
			createRelationsBatchSchema.safeParse({ fromItemIds: ['no-uuid'], toItemIds: [ITEM] }).success
		).toBe(false);
	});
});
