import { json } from '@sveltejs/kit';
import { IMAGE_MAX_DIMENSION, IMAGE_THUMB_DIMENSION, MAX_UPLOAD_BYTES } from '$app/env/private';
import { errorResponse } from '#lib/server/api';
import { requireCapture, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { appendPhoto } from '#lib/server/domain/photos';
import { isUuid } from '#lib/server/params';
import { storage } from '#lib/server/storage';
import type { RequestHandler } from './$types';

interface UploadResult {
	name: string;
	ok: boolean;
	status: number;
	message?: string;
	photo?: unknown;
}

/**
 * Sube una o varias fotografías a un objetivo. Cada archivo se procesa de forma
 * independiente: un fallo concreto no impide el resto (sin falso éxito).
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!isUuid(params.targetId)) {
		return json({ message: 'Evidencia inválida.' }, { status: 400 });
	}

	const user = requireUser(locals);

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ message: 'Se esperaba un formulario multipart.' }, { status: 400 });
	}

	const requirementField = form.get('requirementId');
	let requirementId: string | null = null;
	if (typeof requirementField === 'string' && requirementField.length > 0) {
		if (!isUuid(requirementField)) {
			return json({ message: 'Requisito inválido.' }, { status: 400 });
		}
		requirementId = requirementField;
	}

	const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
	if (files.length === 0) {
		return json({ message: 'No se recibió ningún archivo.' }, { status: 400 });
	}

	let target;
	try {
		target = await requireCapture(locals, params.targetId);
	} catch (error) {
		return errorResponse(error);
	}

	const results: UploadResult[] = [];
	let latestVersion = target.version;

	for (const file of files) {
		if (file.size === 0) {
			results.push({ name: file.name, ok: false, status: 400, message: 'Archivo vacío.' });
			continue;
		}
		if (file.size > MAX_UPLOAD_BYTES) {
			results.push({
				name: file.name,
				ok: false,
				status: 413,
				message: 'El archivo supera el tamaño máximo permitido.'
			});
			continue;
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		try {
			const { photo, version } = await appendPhoto(getDatabase().db, storage, {
				targetId: target.id,
				requirementId,
				buffer,
				userId: user.id,
				maxDimension: IMAGE_MAX_DIMENSION,
				thumbDimension: IMAGE_THUMB_DIMENSION
			});
			latestVersion = version;
			results.push({ name: file.name, ok: true, status: 201, photo });
		} catch (error) {
			const response = errorResponse(error);
			const body = (await response.json()) as { message?: string };
			results.push({
				name: file.name,
				ok: false,
				status: response.status,
				message: body.message ?? 'No se pudo procesar la imagen.'
			});
		}
	}

	return json({ results, version: latestVersion });
};
