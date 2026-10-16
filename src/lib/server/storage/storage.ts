import { randomBytes } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Almacenamiento local de fotografías y miniaturas. Trabaja con **rutas
 * relativas** internas (nunca URLs públicas). La raíz se inyecta, de modo que
 * las pruebas pueden usar un directorio temporal.
 */
export interface Storage {
	objectRelPath(id: string): string;
	thumbRelPath(id: string): string;
	/** Fondo de PDF de un contrato (imagen normalizada). */
	backgroundRelPath(contractId: string): string;
	absolute(relPath: string): string;
	/** Escribe de forma atómica (temporal + rename en el mismo volumen). */
	save(relPath: string, data: Buffer): Promise<void>;
	remove(relPath: string): Promise<void>;
	ensure(): Promise<void>;
}

/** Distribuye en subcarpetas `ab/cd` a partir del id para evitar directorios enormes. */
function shard(id: string): string {
	const hex = id.replace(/-/g, '');
	return `${hex.slice(0, 2)}/${hex.slice(2, 4)}`;
}

export function createStorage(root: string): Storage {
	const absolute = (relPath: string) => path.join(root, relPath);

	return {
		objectRelPath: (id) => `objects/${shard(id)}/${id}.jpg`,
		thumbRelPath: (id) => `thumbnails/${shard(id)}/${id}.webp`,
		backgroundRelPath: (contractId) => `backgrounds/${contractId}.png`,
		absolute,

		async save(relPath, data) {
			const dest = absolute(relPath);
			await mkdir(path.dirname(dest), { recursive: true });
			const tmp = `${dest}.tmp-${randomBytes(6).toString('hex')}`;
			await writeFile(tmp, data);
			await rename(tmp, dest);
		},

		async remove(relPath) {
			try {
				await unlink(absolute(relPath));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			}
		},

		async ensure() {
			for (const dir of ['objects', 'thumbnails', 'staging', 'export-temp']) {
				await mkdir(path.join(root, dir), { recursive: true });
			}
		}
	};
}
