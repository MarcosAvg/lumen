import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
	it('combina clases y descarta valores falsy', () => {
		expect(cn('a', undefined, false, 'c')).toBe('a c');
	});

	it('resuelve conflictos de utilidades de Tailwind', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
	});
});
