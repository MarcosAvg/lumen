// Genera los PNG de la PWA a partir de los SVG de `static/icons`.
//
//   pnpm icons:generate
//
// - `icon.svg`           → icon-192.png, icon-512.png (purpose: any)
// - `icon-maskable.svg`  → icon-maskable-512.png, apple-touch-icon-180.png (opacos)
// - `icon-monochrome.svg`→ icon-monochrome-512.png
// - `badge.svg`          → badge-96.png (notificaciones Android)
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.resolve('static/icons');

async function render(source, output, size, { opaque = false } = {}) {
	const svg = await readFile(path.join(dir, source));
	let pipeline = sharp(svg, { density: 384 }).resize(size, size);
	if (opaque) pipeline = pipeline.flatten({ background: '#0f172a' }).removeAlpha();

	const file = path.join(dir, output);
	await pipeline.png().toFile(file);
	const meta = await sharp(file).metadata();
	console.log(`✓ ${output}: ${meta.width}x${meta.height}${meta.hasAlpha ? ' (alpha)' : ''}`);
}

await render('icon.svg', 'icon-192.png', 192);
await render('icon.svg', 'icon-512.png', 512);
await render('icon-maskable.svg', 'icon-maskable-512.png', 512, { opaque: true });
await render('icon-maskable.svg', 'apple-touch-icon-180.png', 180, { opaque: true });
await render('icon-monochrome.svg', 'icon-monochrome-512.png', 512);
await render('badge.svg', 'badge-96.png', 96);
