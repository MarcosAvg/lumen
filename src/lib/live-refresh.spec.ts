import { describe, expect, it } from 'vitest';
import { isEvidencePage } from './live-refresh';

describe('isEvidencePage', () => {
	it('detecta las fichas de trabajo y elemento', () => {
		expect(isEvidencePage('/works/123')).toBe(true);
		expect(isEvidencePage('/works/123/')).toBe(true);
		expect(isEvidencePage('/elements/abc')).toBe(true);
	});

	it('no trata como evidencia las listas ni otras fichas', () => {
		for (const pathname of [
			'/dashboard',
			'/reviews',
			'/notifications',
			'/services/1',
			'/contracts/1',
			'/admin/services/1',
			'/submissions/1',
			'/works',
			'/elements'
		]) {
			expect(isEvidencePage(pathname), pathname).toBe(false);
		}
	});
});
