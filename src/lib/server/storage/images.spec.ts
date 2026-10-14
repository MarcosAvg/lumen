import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ImageError, processImage } from './images';

const OPTIONS = { maxDimension: 2560, thumbDimension: 400 };

describe('processImage', () => {
	it('normaliza una imagen a JPEG y genera miniatura WebP sin metadatos', async () => {
		const png = await sharp({
			create: { width: 1200, height: 800, channels: 3, background: { r: 51, g: 102, b: 255 } }
		})
			.png()
			.toBuffer();

		const result = await processImage(png, OPTIONS);

		const jpegMeta = await sharp(result.jpeg).metadata();
		expect(jpegMeta.format).toBe('jpeg');
		expect(jpegMeta.width).toBe(1200);
		expect(jpegMeta.exif).toBeUndefined();

		const thumbMeta = await sharp(result.thumbnail).metadata();
		expect(thumbMeta.format).toBe('webp');
		expect(Math.max(thumbMeta.width ?? 0, thumbMeta.height ?? 0)).toBeLessThanOrEqual(400);
		expect(result.checksum).toHaveLength(64);
	});

	it('limita el lado mayor a maxDimension reduciendo la imagen', async () => {
		const big = await sharp({
			create: { width: 4000, height: 1000, channels: 3, background: { r: 0, g: 0, b: 0 } }
		})
			.jpeg()
			.toBuffer();

		const result = await processImage(big, OPTIONS);
		expect(result.width).toBe(2560);
		expect(result.height).toBe(640);
	});

	it('rechaza contenido que no es una imagen', async () => {
		await expect(processImage(Buffer.from('no soy una imagen'), OPTIONS)).rejects.toBeInstanceOf(
			ImageError
		);
	});

	it('rechaza formatos no permitidos (GIF)', async () => {
		const gif = await sharp({
			create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } }
		})
			.gif()
			.toBuffer();

		await expect(processImage(gif, OPTIONS)).rejects.toBeInstanceOf(ImageError);
	});
});
