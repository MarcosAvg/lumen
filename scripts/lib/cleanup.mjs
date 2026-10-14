import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

/** Lista archivos recursivamente devolviendo rutas relativas en formato POSIX. */
async function listFiles(root, dir = root, acc = []) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') return acc;
		throw error;
	}
	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await listFiles(root, abs, acc);
		} else if (entry.isFile()) {
			const info = await stat(abs);
			acc.push({
				abs,
				rel: path.relative(root, abs).split(path.sep).join('/'),
				mtimeMs: info.mtimeMs
			});
		}
	}
	return acc;
}

/**
 * Borra temporales de staging y binarios sin referencia en `photos`. Solo elimina
 * archivos con antigüedad mínima (para no competir con subidas en curso) y nunca
 * toca archivos referenciados.
 *
 * @param {{
 *   root: string,
 *   databaseUrl: string,
 *   minAgeMs?: number,
 *   stagingMaxAgeMs?: number,
 *   now?: number
 * }} options
 * @returns {Promise<{ orphansRemoved: number, stagingRemoved: number }>}
 */
export async function cleanupOrphans(options) {
	const {
		root,
		databaseUrl,
		minAgeMs = 60 * 60 * 1000,
		stagingMaxAgeMs = 60 * 60 * 1000,
		now = Date.now()
	} = options;

	const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	try {
		const rows = await client`select storage_path, thumbnail_path from photos`;
		const referenced = new Set();
		for (const row of rows) {
			referenced.add(row.storage_path);
			referenced.add(row.thumbnail_path);
		}

		let orphansRemoved = 0;
		for (const sub of ['objects', 'thumbnails']) {
			for (const file of await listFiles(root, path.join(root, sub))) {
				if (now - file.mtimeMs < minAgeMs) continue;
				if (!referenced.has(file.rel)) {
					await unlink(file.abs);
					orphansRemoved += 1;
				}
			}
		}

		let stagingRemoved = 0;
		for (const file of await listFiles(root, path.join(root, 'staging'))) {
			if (now - file.mtimeMs < stagingMaxAgeMs) continue;
			await unlink(file.abs);
			stagingRemoved += 1;
		}

		return { orphansRemoved, stagingRemoved };
	} finally {
		await client.end();
	}
}
