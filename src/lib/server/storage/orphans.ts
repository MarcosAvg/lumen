import { inArray, or } from 'drizzle-orm';
import type { Database } from '#lib/server/db';
import { photos } from '#lib/server/db/schema';
import type { Storage } from './storage';

/**
 * Limpieza diferida de binarios que quedaron sin referencia tras un borrado
 * destructivo. Se ejecuta **después** del commit y es best-effort: si algo falla,
 * `scripts/cleanup.mjs` los recogerá más tarde. Nunca borra archivos referenciados.
 */
export async function removeUnreferencedFiles(
	db: Database,
	storage: Storage,
	paths: string[]
): Promise<number> {
	const unique = [...new Set(paths)];
	if (unique.length === 0) return 0;

	const stillReferenced = await db
		.select({ storagePath: photos.storagePath, thumbnailPath: photos.thumbnailPath })
		.from(photos)
		.where(or(inArray(photos.storagePath, unique), inArray(photos.thumbnailPath, unique)));

	const referenced = new Set<string>();
	for (const row of stillReferenced) {
		referenced.add(row.storagePath);
		referenced.add(row.thumbnailPath);
	}

	let removed = 0;
	for (const relPath of unique) {
		if (referenced.has(relPath)) continue;
		try {
			await storage.remove(relPath);
			removed += 1;
		} catch (error) {
			console.error('[orphans] no se pudo borrar el binario', relPath, error);
		}
	}
	return removed;
}
