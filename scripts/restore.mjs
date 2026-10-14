// Restaura un backup creado por `pnpm backup`.
//
//   pnpm restore ./backups/<fecha>
//   RESTORE_DATABASE=lumen_restore pnpm restore ./backups/<fecha>
//
// Sobrescribe la base de datos destino (`--clean --if-exists`) y extrae las
// fotos. Hazlo siempre sobre un entorno separado antes de tocar producción.
import { restoreBackup } from './lib/backup.mjs';

const backupDir = process.argv[2] || process.env.BACKUP_DIR;
if (!backupDir) {
	console.error('Uso: pnpm restore <directorio-de-backup>');
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL no está configurada; no se puede restaurar.');
	process.exit(1);
}

const photosPath = process.env.PHOTO_STORAGE_PATH || undefined;
const targetDatabase = process.env.RESTORE_DATABASE || undefined;

try {
	const result = await restoreBackup({ backupDir, databaseUrl, photosPath, targetDatabase });
	console.log(`Restauración completada en la base «${result.database}».`);
	console.log(`Fotos restauradas en: ${result.photos}`);
	console.log('Verifica recuento de fotos, miniaturas, historial y descargas.');
} catch (error) {
	console.error('Fallo la restauración:', error.message);
	process.exitCode = 1;
}
