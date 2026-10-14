// Runner de migraciones de Lumen.
//
// Usa únicamente `drizzle-orm` y `postgres`, por lo que funciona tanto en
// desarrollo como en la imagen de producción (sin `drizzle-kit`). La carpeta
// `./drizzle` se resuelve relativa al directorio de trabajo del proceso.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL no está configurada; no se pueden aplicar migraciones.');
	process.exit(1);
}

const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
	// El migrador de drizzle-orm serializa ejecuciones concurrentes con un
	// bloqueo de asesoría, por lo que es seguro ante despliegues solapados.
	await migrate(drizzle(client), { migrationsFolder: './drizzle' });
	console.log('Migraciones aplicadas correctamente.');
} catch (error) {
	console.error('Fallo al aplicar migraciones:', error);
	process.exitCode = 1;
} finally {
	await client.end();
}
