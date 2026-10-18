import { describe, expect, it } from 'vitest';
import { parseExportRequest } from './options';

describe('parseExportRequest', () => {
	it('mantiene pdf=1 como PDF por trabajo', () => {
		const options = parseExportRequest(new URL('https://lumen.test/export?pdf=1'));
		expect(options.pdf).toBe(true);
		expect(options.compiledPdf).toBe(false);
	});

	it('interpreta el PDF recopilado como opción independiente', () => {
		const options = parseExportRequest(new URL('https://lumen.test/export?pdf=1&compiledPdf=1'));
		expect(options.pdf).toBe(true);
		expect(options.compiledPdf).toBe(true);
	});

	it('permite solo el recopilado o ninguno', () => {
		expect(
			parseExportRequest(new URL('https://lumen.test/export?pdf=0&compiledPdf=1'))
		).toMatchObject({ pdf: false, compiledPdf: true });
		expect(
			parseExportRequest(new URL('https://lumen.test/export?pdf=0&compiledPdf=0'))
		).toMatchObject({ pdf: false, compiledPdf: false });
	});
});
