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

function isUndefinedTable(error: unknown): boolean {
	return (error as PgError | null)?.code === '42P01';
}

async function migrationsApplied(sql: Sql): Promise<boolean> {
	const rows = await sql<{ count: number }[]>`
		select count(*)::int as count
		from information_schema.tables
		where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
	`;
	return (rows[0]?.count ?? 0) > 0;
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
 * Comprueba la conectividad con PostgreSQL y el estado de las migraciones.
 * No expone datos sensibles ni recuentos.
 */
export async function checkHealth(): Promise<HealthReport> {
	let sql: Sql;
	try {
		sql = getDatabase().client;
		await sql`select 1`;
	} catch {
		return { status: 'degraded', database: 'down', migrations: 'unknown', setupRequired: true };
	}

	let migrations: HealthReport['migrations'];
	try {
		migrations = (await migrationsApplied(sql)) ? 'applied' : 'pending';
	} catch {
		migrations = 'unknown';
	}

	return {
		status: migrations === 'applied' ? 'ok' : 'degraded',
		database: 'up',
		migrations,
		setupRequired: await setupRequired(sql)
	};
}
