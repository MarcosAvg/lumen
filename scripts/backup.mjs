// Crea un backup consistente de la base de datos y del volumen de fotos.
//
//   pnpm backup                 # guarda en ./backups/<fecha>/
//   BACKUP_DIR=/ruta pnpm backup
//
// Requiere DATABASE_URL y, opcionalmente, PHOTO_STORAGE_PATH (si no existe, se
// archiva el volumen del contenedor `app`).
import path from 'node:path';
import { createBackup } from './lib/backup.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL no está configurada; no se puede hacer backup.');
	process.exit(1);
}

const photosPath = process.env.PHOTO_STORAGE_PATH || undefined;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.env.BACKUP_DIR || './backups', stamp);

try {
	const manifest = await createBackup({ databaseUrl, photosPath, outDir });
	console.log(`Backup creado en ${outDir}`);
	console.log(`  base de datos: ${manifest.database}`);
	console.log(`  db.dump: ${manifest.files['db.dump'].bytes} bytes`);
	console.log(`  photos.tar.gz: ${manifest.files['photos.tar.gz'].bytes} bytes`);
	console.log('Verifica la restauración con `pnpm restore <directorio>` en un entorno separado.');
} catch (error) {
	console.error('Fallo el backup:', error.message);
	process.exitCode = 1;
}
