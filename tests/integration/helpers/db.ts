import { afterAll, describe } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '../../../src/lib/server/db/schema';

/**
 * Base de datos de pruebas. Por defecto apunta al PostgreSQL de `compose.yaml`
 * (publicado en 127.0.0.1:5432). Puede sobreescribirse con `TEST_DATABASE_URL`.
 */
const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ?? 'postgres://lumen:cambia-esta-clave@127.0.0.1:5432/lumen_test';

export { TEST_DATABASE_URL };

export type TestClient = ReturnType<typeof postgres>;
export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TestContext {
	client: TestClient;
	db: TestDb;
}

function databaseName(url: string): string {
	return new URL(url).pathname.replace(/^\//, '');
}

async function ensureDatabaseExists(): Promise<void> {
	const adminUrl = new URL(TEST_DATABASE_URL);
	adminUrl.pathname = '/postgres';
	const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
	const dbName = databaseName(TEST_DATABASE_URL);
	try {
		const existing = await admin`select 1 from pg_database where datname = ${dbName}`;
		if (existing.length === 0) {
			// El nombre proviene de nuestra propia configuración, no de entrada de usuario.
			await admin.unsafe(`create database "${dbName.replace(/"/g, '')}"`);
		}
	} finally {
		await admin.end();
	}
}

export async function createTestDatabase(): Promise<TestContext> {
	await ensureDatabaseExists();
	const client = postgres(TEST_DATABASE_URL, { max: 2, onnotice: () => {} });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: './drizzle' });
	return { client, db };
}

/** Vacía todas las tablas de dominio entre pruebas. */
export async function truncateAll(client: TestClient): Promise<void> {
	await client.unsafe(
		'truncate table notifications, push_subscriptions, service_assignments, audit_events, sessions, services, users, catalogs, catalog_items, catalog_item_relations, works, elements, photos, photo_requirements, reviews, submission_photos, evidence_submissions, evidence_targets restart identity cascade'
	);
}

/**
 * Ejecuta una suite solo si la base de datos de pruebas está disponible; en caso
 * contrario la omite con un aviso (no rompe `pnpm test` sin PostgreSQL).
 */
export async function describeWithDatabase(
	name: string,
	register: (context: TestContext) => void
): Promise<void> {
	let context: TestContext | null = null;
	try {
		context = await createTestDatabase();
	} catch (error) {
		console.warn(
			`[integración] Se omite "${name}": no hay PostgreSQL en ${TEST_DATABASE_URL}. ${(error as Error).message}`
		);
	}

	if (!context) {
		describe.skip(name, () => {});
		return;
	}

	describe(name, () => {
		afterAll(async () => {
			// Libera conexiones al terminar la suite (evita agotar el pool de Postgres).
			await (context as TestContext).client.end();
		});
		register(context as TestContext);
	});
}
