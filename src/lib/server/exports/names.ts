/**
 * Saneado de nombres para rutas de ZIP/CSV (docs/04 §7): evita traversal,
 * caracteres de control, colisiones y problemas con sistemas de archivos.
 */

/** Convierte un texto en un segmento seguro (nunca vacío, nunca con `/`). */
export function sanitizeSegment(raw: string, fallback = 'sin-nombre'): string {
	const normalized = (raw ?? '').normalize('NFKC');
	const replaced = normalized
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/[\\/]+/g, '-')
		.replace(/^\.+/, '')
		.replace(/[<>:"|?*]+/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80)
		.replace(/[. ]+$/, '');
	return replaced.length > 0 ? replaced : fallback;
}

/** Identificador corto y seguro derivado de un UUID para desambiguar nombres. */
export function shortId(id: string): string {
	return id.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'x';
}

/**
 * Registro de nombres ya usados dentro de un mismo directorio. Ante repetición
 * (o colisión tras sanear) añade un sufijo corto estable basado en el id.
 */
export class NameRegistry {
	private readonly used = new Map<string, number>();

	unique(name: string, id: string): string {
		const base = sanitizeSegment(name);
		const key = base.toLowerCase();
		const count = this.used.get(key) ?? 0;
		this.used.set(key, count + 1);
		if (count === 0) return base;
		return `${base} (${shortId(id)})`;
	}
}
