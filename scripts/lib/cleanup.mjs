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
 * toca archivos referenciados. También purga suscripciones push **revocadas**
 * antiguas (las activas nunca se tocan).
 *
 * @param {{
 *   root: string,
 *   databaseUrl: string,
 *   minAgeMs?: number,
 *   stagingMaxAgeMs?: number,
 *   pushRetentionDays?: number,
 *   now?: number
 * }} options
 * @returns {Promise<{ orphansRemoved: number, stagingRemoved: number, pushRevokedRemoved: number }>}
 */
export async function cleanupOrphans(options) {
	const {
		root,
		databaseUrl,
		minAgeMs = 60 * 60 * 1000,
		stagingMaxAgeMs = 60 * 60 * 1000,
		pushRetentionDays = 30,
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
				// `mtimeMs` puede superar ligeramente a `now`; se acota a >= 0.
				if (Math.max(0, now - file.mtimeMs) < minAgeMs) continue;
				if (!referenced.has(file.rel)) {
					await unlink(file.abs);
					orphansRemoved += 1;
				}
			}
		}

		let stagingRemoved = 0;
		for (const file of await listFiles(root, path.join(root, 'staging'))) {
			if (Math.max(0, now - file.mtimeMs) < stagingMaxAgeMs) continue;
			await unlink(file.abs);
			stagingRemoved += 1;
		}

		const purged = await client`
			delete from push_subscriptions
			where revoked_at is not null
				and revoked_at < now() - make_interval(days => ${pushRetentionDays})
			returning id
		`;

		return { orphansRemoved, stagingRemoved, pushRevokedRemoved: purged.length };
	} finally {
		await client.end();
	}
}
