// Servidor dedicado para las pruebas E2E de Playwright.
//
//   node scripts/e2e-server.mjs
//
// Migra la base de pruebas, la deja vacía, construye la app con el ORIGIN de
// E2E y arranca el servidor compilado. Playwright lo gestiona como `webServer`.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ?? 'postgres://lumen:cambia-esta-clave@127.0.0.1:5432/lumen_test';
const PORT = process.env.E2E_PORT ?? '4173';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PHOTO_STORAGE_PATH = path.resolve('.e2e/photos');

const TABLES = [
	'notifications',
	'push_subscriptions',
	'service_assignments',
	'audit_events',
	'sessions',
	'services',
	'users',
	'catalogs',
	'catalog_items',
	'catalog_item_relations',
	'works',
	'elements',
	'photos',
	'photo_requirements',
	'reviews',
	'submission_photos',
	'evidence_submissions',
	'evidence_targets'
];

function run(command, args, env) {
	const result = spawnSync(command, args, { stdio: 'inherit', env, shell: false });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} falló con código ${result.status}`);
	}
}

mkdirSync(PHOTO_STORAGE_PATH, { recursive: true });
rmSync(PHOTO_STORAGE_PATH, { recursive: true, force: true });
mkdirSync(PHOTO_STORAGE_PATH, { recursive: true });

const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, ORIGIN };

// Migra y vacía la base de pruebas para partir de un estado conocido.
run('node', ['scripts/migrate.mjs'], env);
const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
await sql.unsafe(`truncate table ${TABLES.join(', ')} restart identity cascade`);
await sql.end();

// Construye con el ORIGIN de E2E (CSRF/URLs absolutas) y arranca el servidor.
run('pnpm', ['build'], { ...env, ORIGIN });

const server = spawn('node', ['build/index.js'], {
	stdio: 'inherit',
	env: { ...env, PHOTO_STORAGE_PATH, PORT, HOST: '127.0.0.1', BODY_SIZE_LIMIT: '30M' }
});

const shutdown = (signal) => {
	server.kill(signal);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
server.on('exit', (code) => process.exit(code ?? 0));
