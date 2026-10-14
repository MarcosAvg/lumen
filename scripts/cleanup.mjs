// Limpieza de temporales y binarios huérfanos.
//
//   node --env-file-if-exists=.env scripts/cleanup.mjs
//
// Requiere DATABASE_URL y PHOTO_STORAGE_PATH. Pensado para ejecutarse por cron o
// desde el contenedor; nunca borra archivos referenciados por la base de datos.
import { cleanupOrphans } from './lib/cleanup.mjs';

const databaseUrl = process.env.DATABASE_URL;
const root = process.env.PHOTO_STORAGE_PATH || '/data/photos';

if (!databaseUrl) {
	console.error('DATABASE_URL no está configurada; no se puede limpiar.');
	process.exit(1);
}

try {
	const result = await cleanupOrphans({ root, databaseUrl });
	console.log(
		`Limpieza completada: ${result.orphansRemoved} huérfano(s), ${result.stagingRemoved} temporal(es).`
	);
} catch (error) {
	console.error('Fallo en la limpieza:', error);
	process.exitCode = 1;
}
