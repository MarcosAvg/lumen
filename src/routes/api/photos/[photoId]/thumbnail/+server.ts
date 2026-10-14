import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { errorResponse } from '#lib/server/api';
import { requirePhotoAccess } from '#lib/server/auth/guards';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

/** Miniatura autenticada (WebP). Misma autorización que la fotografía. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.photoId)) return new Response('No encontrada', { status: 404 });

	let photo;
	try {
		photo = await requirePhotoAccess(locals, params.photoId);
	} catch (error) {
		return errorResponse(error);
	}

	if (photo.processingStatus !== 'ready') {
		return new Response('No disponible', { status: 404 });
	}

	const filePath = storage.absolute(photo.thumbnailPath);
	try {
		await stat(filePath);
	} catch {
		return new Response('No disponible', { status: 404 });
	}

	const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
	return new Response(stream, {
		headers: {
			'Content-Type': 'image/webp',
			'Cache-Control': 'private, max-age=3600',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
