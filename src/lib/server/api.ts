import { isHttpError, json } from '@sveltejs/kit';
import { isDomainError } from './domain/errors';

/**
 * Traduce un error a una respuesta JSON coherente para la API:
 * - `DomainError` conserva su estado y mensaje.
 * - Los errores HTTP de SvelteKit (`error(401)`, `error(403)`…) conservan su estado.
 * - El resto se reporta como `500` sin filtrar detalles.
 */
export function errorResponse(error: unknown): Response {
	if (isDomainError(error)) {
		return json(
			{ message: error.message, details: error.details ?? null },
			{ status: error.status }
		);
	}
	if (isHttpError(error)) {
		return json({ message: error.body?.message ?? 'Error' }, { status: error.status });
	}
	console.error('[api]', error);
	return json({ message: 'Error interno.' }, { status: 500 });
}
