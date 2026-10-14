/**
 * Utilidades CSV (docs/04 §7): UTF-8 con BOM opcional, comillas/escapes y
 * neutralización de inyección de fórmulas en hojas de cálculo.
 */

/** Un valor que empieza por `= + - @` (o control) se prefija para no ejecutarse. */
const RISKY_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
	const raw = value === null || value === undefined ? '' : String(value);
	const safe = RISKY_PREFIX.test(raw) ? `'${raw}` : raw;
	return /["\n\r,;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(
	rows: (string | number | null | undefined)[][],
	options: { bom?: boolean } = {}
): string {
	const body = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
	const csv = `${body}\r\n`;
	return options.bom ? `\uFEFF${csv}` : csv;
}
