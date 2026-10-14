import { error } from '@sveltejs/kit';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

/** Valida un parámetro de ruta con forma de UUID; si no, trata el recurso como inexistente. */
export function requireUuidParam(value: string, label = 'Recurso'): string {
	if (!isUuid(value)) throw error(404, `${label} no encontrado.`);
	return value;
}
