import type { WorkbookVariant } from './workbook';

/** Opciones de exportación elegidas en el modal de la UI (query params). */
export interface ExportRequestOptions {
	variant: WorkbookVariant;
	/** Incluir el registro XLSX en el ZIP. */
	xlsx: boolean;
	/** Incluir las carpetas de fotografías en el ZIP. */
	photos: boolean;
}

/**
 * Lee las opciones de la URL: `?variant=simple|extended&xlsx=0|1&photos=0|1`.
 * Por defecto: variante extendida, con XLSX y con fotografías.
 */
export function parseExportRequest(url: URL): ExportRequestOptions {
	const rawVariant = url.searchParams.get('variant');
	return {
		variant: rawVariant === 'simple' ? 'simple' : 'extended',
		xlsx: url.searchParams.get('xlsx') !== '0',
		photos: url.searchParams.get('photos') !== '0'
	};
}
