import { fail } from '@sveltejs/kit';
import type { ZodError, ZodType } from 'zod';
import { isDomainError } from '#lib/server/domain/errors';

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

/** Convierte los issues de Zod en un mapa `campo -> primer mensaje`. */
export function fieldErrors(error: ZodError): Record<string, string> {
	const result: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = issue.path.join('.') || '_form';
		if (!result[key]) result[key] = issue.message;
	}
	return result;
}

export function parseForm<T>(schema: ZodType<T>, formData: FormData): ParseResult<T> {
	const raw = Object.fromEntries(formData);
	const parsed = schema.safeParse(raw);
	if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
	return { ok: true, data: parsed.data };
}

/**
 * Traduce un `DomainError` a una respuesta `fail` de SvelteKit. Cualquier otro
 * error se relanza para que SvelteKit responda `500` sin filtrar detalles.
 */
export function failFrom(error: unknown, fallbackMessage = 'No se pudo completar la operación.') {
	if (isDomainError(error)) {
		return fail(error.status, { message: error.message, details: error.details ?? null });
	}
	console.error(fallbackMessage, error);
	throw error;
}
