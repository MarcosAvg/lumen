import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema';

function connect() {
	if (!DATABASE_URL) {
		throw new Error('DATABASE_URL no está configurada.');
	}
	// `max` acota las conexiones simultáneas: en un equipo pequeño la carga
	// principal son archivos, no un gran número de conexiones.
	const client = postgres(DATABASE_URL, { max: 10, onnotice: () => {} });
	return { client, db: drizzle(client, { schema }) };
}

type Connection = ReturnType<typeof connect>;

let connection: Connection | undefined;

/**
 * Conexión perezosa a PostgreSQL. No se abre durante el build/prerender, por lo
 * que el análisis de rutas de SvelteKit no requiere una base de datos.
 */
export function getDatabase(): Connection {
	return (connection ??= connect());
}

export type Database = Connection['db'];
