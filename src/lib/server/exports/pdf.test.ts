import { describe, expect, it } from 'vitest';
import { photoLegend } from './pdf';

describe('photoLegend', () => {
	it('une trabajo, elemento y requisito', () => {
		expect(photoLegend('Piso 1', 'UMA 03', 'Antes')).toBe('Piso 1  ·  UMA 03  ·  Antes');
	});

	it('omite elemento y requisito cuando no aplican', () => {
		expect(photoLegend('Piso 1', null, null)).toBe('Piso 1');
		expect(photoLegend('Piso 1', 'UMA 03', null)).toBe('Piso 1  ·  UMA 03');
	});
});
