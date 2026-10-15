import { describe, expect, it } from 'vitest';
import { canExportZip } from './types';

describe('exportación de ZIP (política)', () => {
	it('administradores y supervisores pueden exportar', () => {
		expect(canExportZip('admin')).toBe(true);
		expect(canExportZip('supervisor')).toBe(true);
	});

	it('los técnicos no pueden exportar', () => {
		expect(canExportZip('technician')).toBe(false);
	});
});
