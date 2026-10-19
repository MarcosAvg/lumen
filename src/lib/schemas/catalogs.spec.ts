import { describe, expect, it } from 'vitest';
import { createCatalogSchema, createCatalogTypeSchema } from './catalogs';

const TYPE = '11111111-1111-4111-8111-111111111111';

describe('catálogos (validación)', () => {
	it('exige un tipo de catálogo', () => {
		expect(createCatalogSchema.safeParse({ name: 'Pisos' }).success).toBe(false);
		expect(createCatalogSchema.safeParse({ name: 'Pisos', typeId: TYPE }).success).toBe(true);
	});

	it('normaliza el ámbito de edificios', () => {
		const parsed = createCatalogSchema.safeParse({ name: 'Pisos', typeId: TYPE });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.allBuildings).toBe('true');
	});

	it('valida el nombre del tipo', () => {
		expect(createCatalogTypeSchema.safeParse({ name: '  ' }).success).toBe(false);
		expect(createCatalogTypeSchema.safeParse({ name: 'Sistema' }).success).toBe(true);
	});
});
