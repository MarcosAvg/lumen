import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Utilidades de backup/restauración (docs/04 §11). Usa `pg_dump`/`pg_restore`
 * locales si existen; si no, los ejecuta dentro del contenedor `db` de Compose.
 * Las fotos se archivan del `PHOTO_STORAGE_PATH` local o del volumen del `app`.
 */

export const DB_SERVICE = 'db';
export const APP_SERVICE = 'app';

async function exists(target) {
	try {
		await access(target);
		return true;
	} catch {
		return false;
	}
}

function run(command, args, { stdinFile, stdoutFile, label } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });
		const out = stdoutFile ? createWriteStream(stdoutFile) : null;
		if (out) child.stdout.pipe(out);
		else child.stdout.resume();

		if (stdinFile) createReadStream(stdinFile).pipe(child.stdin);
		else child.stdin.end();

		child.on('error', (error) => reject(new Error(`${label ?? command}: ${error.message}`)));
		child.on('close', (code) => {
			if (out) out.end();
			if (code === 0) resolve();
			else reject(new Error(`${label ?? command} terminó con código ${code}`));
		});
	});
}

async function hasLocal(bin) {
	return new Promise((resolve) => {
		const child = spawn(bin, ['--version'], { stdio: 'ignore' });
		child.on('error', () => resolve(false));
		child.on('close', (code) => resolve(code === 0));
	});
}

export async function sha256(file) {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		const stream = createReadStream(file);
		stream.on('error', reject);
		stream.on('data', (chunk) => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

export function parseDatabaseUrl(url) {
	const parsed = new URL(url);
	return {
		user: decodeURIComponent(parsed.username),
		password: decodeURIComponent(parsed.password),
		database: parsed.pathname.replace(/^\//, ''),
		host: parsed.hostname,
		port: parsed.port
	};
}

/**
 * Crea un backup en `outDir`: `db.dump` (formato custom), `photos.tar.gz` y `manifest.json`.
 */
export async function createBackup({ databaseUrl, photosPath, outDir, database }) {
	await mkdir(outDir, { recursive: true });
	const dumpPath = path.join(outDir, 'db.dump');
	const photosTar = path.join(outDir, 'photos.tar.gz');
	const parsed = parseDatabaseUrl(databaseUrl);
	const dbName = database ?? parsed.database;

	if (await hasLocal('pg_dump')) {
		await run('pg_dump', [databaseUrl, '--format=custom', '--no-owner'], {
			stdoutFile: dumpPath,
			label: 'pg_dump'
		});
	} else {
		await run(
			'docker',
			[
				'compose',
				'exec',
				'-T',
				DB_SERVICE,
				'pg_dump',
				'-U',
				parsed.user,
				'-d',
				dbName,
				'--format=custom',
				'--no-owner'
			],
			{
				stdoutFile: dumpPath,
				label: 'docker compose exec db pg_dump'
			}
		);
	}

	if (photosPath && (await exists(photosPath))) {
		await run('tar', ['-C', photosPath, '-czf', photosTar, '.'], { label: 'tar fotos' });
	} else {
		await run(
			'docker',
			[
				'compose',
				'run',
				'--rm',
				'-T',
				'--no-deps',
				APP_SERVICE,
				'tar',
				'-C',
				'/data/photos',
				'-czf',
				'-',
				'.'
			],
			{ stdoutFile: photosTar, label: 'docker compose run app tar' }
		);
	}

	const [dumpStat, photosStat] = await Promise.all([stat(dumpPath), stat(photosTar)]);
	const manifest = {
		createdAt: new Date().toISOString(),
		database: dbName,
		files: {
			'db.dump': { bytes: dumpStat.size, sha256: await sha256(dumpPath) },
			'photos.tar.gz': { bytes: photosStat.size, sha256: await sha256(photosTar) }
		}
	};
	await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

/** Restaura un backup en la base de datos destino y el almacenamiento de fotos. */
export async function restoreBackup({ backupDir, databaseUrl, photosPath, targetDatabase }) {
	const dumpPath = path.join(backupDir, 'db.dump');
	const photosTar = path.join(backupDir, 'photos.tar.gz');
	if (!(await exists(dumpPath)) || !(await exists(photosTar))) {
		throw new Error(`El backup en ${backupDir} está incompleto (faltan db.dump o photos.tar.gz).`);
	}
	const parsed = parseDatabaseUrl(databaseUrl);
	const dbName = targetDatabase ?? parsed.database;

	if (await hasLocal('pg_restore')) {
		await run('pg_restore', [`--dbname=${databaseUrl}`, '--clean', '--if-exists', '--no-owner'], {
			stdinFile: dumpPath,
			label: 'pg_restore'
		});
	} else {
		await run(
			'docker',
			[
				'compose',
				'exec',
				'-T',
				DB_SERVICE,
				'pg_restore',
				'-U',
				parsed.user,
				'-d',
				dbName,
				'--clean',
				'--if-exists',
				'--no-owner'
			],
			{ stdinFile: dumpPath, label: 'docker compose exec db pg_restore' }
		);
	}

	if (photosPath) {
		await mkdir(photosPath, { recursive: true });
		await run('tar', ['-xzf', photosTar, '-C', photosPath], { label: 'tar fotos' });
	} else {
		await run(
			'docker',
			[
				'compose',
				'run',
				'--rm',
				'-T',
				'--no-deps',
				APP_SERVICE,
				'tar',
				'-xzf',
				'-',
				'-C',
				'/data/photos'
			],
			{ stdinFile: photosTar, label: 'docker compose run app tar' }
		);
	}
	return { database: dbName, photos: photosPath ?? 'volumen app:/data/photos' };
}

export async function readManifest(backupDir) {
	return JSON.parse(await readFile(path.join(backupDir, 'manifest.json'), 'utf8'));
}
