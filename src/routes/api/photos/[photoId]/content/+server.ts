import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { errorResponse } from '#lib/server/api';
import { requirePhotoAccess } from '#lib/server/auth/guards';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/** Descarga autenticada del archivo optimizado. Nunca expone rutas del volumen. */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!isUuid(params.photoId)) return new Response('No encontrada', { status: 404 });

	let photo;
	try {
		photo = await requirePhotoAccess(locals, params.photoId);
	} catch (error) {
		return errorResponse(error);
	}

	if (photo.processingStatus !== 'ready' || photo.removedAt) {
		return new Response('No disponible', { status: 404 });
	}

	const filePath = storage.absolute(photo.storagePath);
	try {
		await stat(filePath);
	} catch {
		return new Response('No disponible', { status: 404 });
	}

	const download = url.searchParams.get('download') === '1';
	const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;

	return new Response(stream, {
		headers: {
			'Content-Type': photo.mimeType,
			'Cache-Control': 'private, max-age=3600',
			'Content-Disposition': download
				? `attachment; filename="${photo.id}.jpg"`
				: `inline; filename="${photo.id}.jpg"`,
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
