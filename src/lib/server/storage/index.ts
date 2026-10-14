import { PHOTO_STORAGE_PATH } from '$app/env/private';
import { createStorage } from './storage';

/** Almacenamiento de la aplicación, con la raíz del volumen persistente. */
export const storage = createStorage(PHOTO_STORAGE_PATH || '/data/photos');

export { createStorage } from './storage';
export type { Storage } from './storage';
export { ImageError, processImage, createLimiter } from './images';
export type { ProcessedImage } from './images';
