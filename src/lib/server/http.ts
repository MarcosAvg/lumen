import { error } from '@sveltejs/kit';
import { isDomainError } from './domain/errors';

/**
 * Convierte un `DomainError` (p. ej. 404 de recurso fuera de ámbito o inexistente)
 * en un `HttpError` de SvelteKit. Cualquier otro error se relanza sin cambios.
 *
 * Necesario porque un `DomainError` que escapa de un `load` o una acción se
 * renderiza como `500`, no con el estado del dominio.
 */
export function toHttpError(cause: unknown): never {
	if (isDomainError(cause)) {
		throw error(cause.status, cause.message);
	}
	throw cause;
}

/** Ejecuta una operación de dominio traduciendo `DomainError` a `HttpError`. */
export async function orHttp<T>(operation: Promise<T>): Promise<T> {
	try {
		return await operation;
	} catch (cause) {
		toHttpError(cause);
	}
}
