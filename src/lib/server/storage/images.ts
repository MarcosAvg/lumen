import { createHash } from 'node:crypto';
import sharp from 'sharp';

/** Error de procesado con el estado HTTP sugerido. */
export class ImageError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ImageError';
	}
}

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

type SharpMetadata = Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;

export interface ProcessImageOptions {
	maxDimension: number;
	thumbDimension: number;
	/** Límite de píxeles de entrada para evitar bombas de descompresión. */
	maxPixels?: number;
}

export interface ProcessedImage {
	jpeg: Buffer;
	thumbnail: Buffer;
	width: number;
	height: number;
	checksum: string;
}

/**
 * Normaliza una fotografía: valida el formato **por contenido**, corrige la
 * orientación, elimina metadatos (incluida ubicación GPS), limita el lado mayor y
 * genera una miniatura WebP. Devuelve el objeto JPEG y la miniatura listos para
 * persistir.
 */
export async function processImage(
	input: Buffer,
	options: ProcessImageOptions
): Promise<ProcessedImage> {
	const maxPixels = options.maxPixels ?? 100_000_000;

	let metadata: SharpMetadata;
	try {
		metadata = await sharp(input, { limitInputPixels: maxPixels }).metadata();
	} catch {
		throw new ImageError(415, 'El archivo no es una imagen válida o usa un formato no soportado.');
	}

	if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
		throw new ImageError(415, 'Formato no soportado. Usa JPEG, PNG o WebP.');
	}
	if (!metadata.width || !metadata.height) {
		throw new ImageError(415, 'No se pudieron leer las dimensiones de la imagen.');
	}

	try {
		const pipeline = () => sharp(input, { limitInputPixels: maxPixels }).rotate();

		const jpeg = await pipeline()
			.resize({
				width: options.maxDimension,
				height: options.maxDimension,
				fit: 'inside',
				withoutEnlargement: true
			})
			.jpeg({ quality: 82 })
			.toBuffer();

		const thumbnail = await pipeline()
			.resize({
				width: options.thumbDimension,
				height: options.thumbDimension,
				fit: 'inside',
				withoutEnlargement: true
			})
			.webp({ quality: 80 })
			.toBuffer();

		const output = await sharp(jpeg).metadata();
		const checksum = createHash('sha256').update(jpeg).digest('hex');

		return {
			jpeg,
			thumbnail,
			width: output.width ?? options.maxDimension,
			height: output.height ?? options.maxDimension,
			checksum
		};
	} catch (error) {
		if (error instanceof ImageError) throw error;
		throw new ImageError(422, 'No se pudo procesar la imagen.');
	}
}

/** Semáforo simple para acotar el procesado concurrente de imágenes. */
export function createLimiter(limit: number) {
	let active = 0;
	const queue: (() => void)[] = [];

	return async function run<T>(task: () => Promise<T>): Promise<T> {
		if (active >= limit) {
			await new Promise<void>((resolve) => queue.push(resolve));
		}
		active += 1;
		try {
			return await task();
		} finally {
			active -= 1;
			queue.shift()?.();
		}
	};
}
