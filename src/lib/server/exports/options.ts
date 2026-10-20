import type { WorkbookVariant } from './workbook';

/** Opciones de exportación elegidas en el modal de la UI (query params). */
export interface ExportRequestOptions {
	variant: WorkbookVariant;
	/** Incluir el registro XLSX en el ZIP. */
	xlsx: boolean;
	/** Incluir las carpetas de fotografías en el ZIP. */
	photos: boolean;
	/** Incluir un PDF de evidencia por trabajo. */
	pdf: boolean;
	/** Incluir un PDF recopilado por servicio (independiente del XLSX). */
	compiledPdf: boolean;
	/** En el ZIP de contrato, incluir servicios en espera, inactivos y archivados. */
	includeNonActive: boolean;
}

/**
 * Lee las opciones de la URL:
 * `?variant=simple|extended&xlsx=0|1&photos=0|1&pdf=0|1&compiledPdf=0|1`.
 *
 * El PDF recopilado es un archivo adicional del ZIP y no modifica el XLSX.
 */
export function parseExportRequest(url: URL): ExportRequestOptions {
	const rawVariant = url.searchParams.get('variant');
	return {
		variant: rawVariant === 'simple' ? 'simple' : 'extended',
		xlsx: url.searchParams.get('xlsx') !== '0',
		photos: url.searchParams.get('photos') !== '0',
		pdf: url.searchParams.get('pdf') !== '0',
		compiledPdf: url.searchParams.get('compiledPdf') === '1',
		includeNonActive: url.searchParams.get('includeNonActive') === '1'
	};
}
