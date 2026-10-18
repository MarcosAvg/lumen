import { PHOTO_STORAGE_PATH } from '$app/env/private';
import { createStorage } from './storage';

/** Almacenamiento de la aplicación, con la raíz del volumen persistente. */
export const storage = createStorage(PHOTO_STORAGE_PATH || '/data/photos');

/**
 * Prepara la estructura del volumen al arrancar. Si falla, deja un diagnóstico
 * claro en el log en lugar de esperar al primer upload.
 */
export const storageReady = storage.ensure().catch((error: unknown) => {
	console.error(
		`[storage] No se pudo preparar el almacenamiento en "${PHOTO_STORAGE_PATH || '/data/photos'}". ` +
			'En desarrollo, configura PHOTO_STORAGE_PATH=./data/photos. ' +
			'En Docker, revisa el volumen /data/photos y sus permisos.',
		error
	);
});

export { createStorage } from './storage';
export type { Storage } from './storage';
export { ImageError, processImage, createLimiter } from './images';
export type { ProcessedImage } from './images';
