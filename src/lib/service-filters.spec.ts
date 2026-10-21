import { describe, expect, it } from 'vitest';
import { matchesServiceFilter } from './service-filters';

describe('matchesServiceFilter', () => {
	const base = { lifecycle: 'active' as const, completed: false };

	it('separa activos de completados', () => {
		expect(matchesServiceFilter(base, 'active')).toBe(true);
		expect(matchesServiceFilter(base, 'completed')).toBe(false);
		expect(matchesServiceFilter({ ...base, completed: true }, 'active')).toBe(false);
		expect(matchesServiceFilter({ ...base, completed: true }, 'completed')).toBe(true);
	});

	it('mantiene los demás ciclos de vida en su filtro', () => {
		expect(matchesServiceFilter({ lifecycle: 'planned', completed: false }, 'planned')).toBe(true);
		expect(matchesServiceFilter({ lifecycle: 'inactive', completed: true }, 'completed')).toBe(
			false
		);
		expect(matchesServiceFilter({ lifecycle: 'archived', completed: true }, 'archived')).toBe(true);
	});
});
