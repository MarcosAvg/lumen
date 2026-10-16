import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import type { Storage } from '#lib/server/storage/storage';

export interface ZipInput {
	fileName: string;
	files: { path: string; storagePath: string }[];
	texts?: { path: string; content: string }[];
	/** Entradas binarias generadas al vuelo (p. ej. el XLSX del registro). */
	extra?: { name: string; content: Buffer }[];
}

/** `Content-Disposition` seguro, con variante RFC 5987 para nombres no ASCII. */
export function contentDisposition(fileName: string): string {
	const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Construye una respuesta ZIP **en streaming** (docs/04 §7): nunca carga el ZIP
 * completo en memoria. Los binarios se leen del volumen por flujo.
 */
export function buildZipResponse(input: ZipInput, storage: Storage): Response {
	const archive = new ZipArchive({ zlib: { level: 6 } });

	archive.on('warning', (error: Error & { code?: string }) => {
		if (error.code !== 'ENOENT') console.error('[zip] aviso', error);
	});
	archive.on('error', (error: Error) => {
		console.error('[zip] error', error);
		archive.destroy();
	});

	for (const text of input.texts ?? []) {
		archive.append(text.content, { name: text.path });
	}
	for (const entry of input.extra ?? []) {
		archive.append(entry.content, { name: entry.name });
	}
	for (const file of input.files) {
		archive.append(createReadStream(storage.absolute(file.storagePath)), { name: file.path });
	}

	void archive.finalize();

	const stream = Readable.toWeb(archive) as unknown as ReadableStream;
	return new Response(stream, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': contentDisposition(input.fileName),
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}
