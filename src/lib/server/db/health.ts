import { readFile } from 'node:fs/promises';
import type { Sql } from 'postgres';
import { getDatabase } from './index';

export interface HealthReport {
	/** `ok` solo cuando la base responde y las migraciones están aplicadas. */
	status: 'ok' | 'degraded';
	database: 'up' | 'down';
	migrations: 'applied' | 'pending' | 'unknown';
	/** `true` si todavía no existe ningún administrador activo. */
	setupRequired: boolean;
}

interface PgError {
	code?: string;
}

interface MigrationJournal {
	entries?: { when?: unknown }[];
}

function isUndefinedTable(error: unknown): boolean {
	return (error as PgError | null)?.code === '42P01';
}

function isUndefinedSchema(error: unknown): boolean {
	return (error as PgError | null)?.code === '3F000';
}

/**
 * Marca temporal de la última migración del paquete. Se lee del journal de
 * Drizzle, que se copia a la imagen junto con `drizzle/`.
 *
 * `null` significa que no se pudo determinar (journal ausente o ilegible); en
 * ese caso la salud queda degradada en lugar de asumir que todo está aplicado.
 */
let latestMigrationWhenCache: number | null | undefined;

export async function latestMigrationWhen(): Promise<number | null> {
	if (latestMigrationWhenCache !== undefined) return latestMigrationWhenCache;

	try {
		const raw = await readFile('./drizzle/meta/_journal.json', 'utf8');
		const journal = JSON.parse(raw) as MigrationJournal;
		const entries = Array.isArray(journal.entries) ? journal.entries : [];
		const last = entries.length > 0 ? entries[entries.length - 1]?.when : null;
		latestMigrationWhenCache = typeof last === 'number' && Number.isFinite(last) ? last : null;
	} catch {
		latestMigrationWhenCache = null;
	}

	return latestMigrationWhenCache;
}

async function migrationStatus(
	sql: Sql,
	expectedWhen: number | null
): Promise<HealthReport['migrations']> {
	if (expectedWhen === null) return 'unknown';

	try {
		const [row] = await sql<{ applied: boolean }[]>`
			select exists(
				select 1
				from drizzle.__drizzle_migrations
				where created_at = ${expectedWhen}
			) as applied
		`;
		return row?.applied ? 'applied' : 'pending';
	} catch (error) {
		// Sin esquema/tabla de migraciones todavía no hay nada aplicado.
		if (isUndefinedTable(error) || isUndefinedSchema(error)) return 'pending';
		return 'unknown';
	}
}

async function setupRequired(sql: Sql): Promise<boolean> {
	try {
		const rows = await sql<{ count: number }[]>`
			select count(*)::int as count
			from users
			where role = 'admin' and is_active = true
		`;
		return (rows[0]?.count ?? 0) === 0;
	} catch (error) {
		// La tabla `users` aún no existe (migraciones pendientes): hace falta configurar.
		if (isUndefinedTable(error)) return true;
		throw error;
	}
}

/**
 * Comprueba la conectividad con PostgreSQL y que la **última** migración del
 * paquete esté aplicada. No basta con que exista la tabla de migraciones: una
 * actualización de la app con migraciones pendientes debe reportar `503`.
 *
 * No expone datos sensibles ni recuentos.
 */
export async function checkHealth(sql?: Sql): Promise<HealthReport> {
	const connection = sql ?? getDatabase().client;

	try {
		await connection`select 1`;
	} catch {
		return { status: 'degraded', database: 'down', migrations: 'unknown', setupRequired: true };
	}

	const migrations = await migrationStatus(connection, await latestMigrationWhen());

	return {
		status: migrations === 'applied' ? 'ok' : 'degraded',
		database: 'up',
		migrations,
		setupRequired: await setupRequired(connection)
	};
}
