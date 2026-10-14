import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

/**
 * Configuración central de variables de entorno de Lumen.
 *
 * Las variables requeridas en ejecución se aceptan como opcionales durante el
 * `build` (prerender/análisis) y se validan estrictamente al arrancar. Ver
 * https://svelte.dev/docs/kit/environment-variables
 */

/** Cadena no vacía requerida al arrancar, opcional durante el build. */
const requiredAtRuntime = () => (building ? z.string().optional() : z.string().min(1));

/** Entero positivo con valor por defecto cuando la variable está ausente o vacía. */
const positiveInt = (fallback: number, name: string) => (value: string | undefined) => {
	const raw = value?.trim();
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} debe ser un entero positivo (se recibió "${value}").`);
	}
	return parsed;
};

/** Cadena opcional; una cadena vacía se interpreta como ausente. */
const optionalString = (value: string | undefined) => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
};

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Cadena de conexión interna a PostgreSQL.',
		schema: requiredAtRuntime()
	},
	ORIGIN: {
		description: 'URL pública HTTPS de Lumen (redirecciones, cookies y CSRF).',
		schema: building ? z.string().optional() : z.url()
	},
	PHOTO_STORAGE_PATH: {
		description: 'Ruta del volumen persistente donde se guardan fotos y miniaturas.',
		schema: z.string().min(1).default('/data/photos')
	},
	MAX_UPLOAD_BYTES: {
		description: 'Tamaño máximo permitido por archivo subido, en bytes.',
		schema: positiveInt(25 * 1024 * 1024, 'MAX_UPLOAD_BYTES')
	},
	IMAGE_MAX_DIMENSION: {
		description: 'Lado mayor al que se normalizan las fotografías (px).',
		schema: positiveInt(2560, 'IMAGE_MAX_DIMENSION')
	},
	IMAGE_THUMB_DIMENSION: {
		description: 'Lado mayor de las miniaturas generadas (px).',
		schema: positiveInt(400, 'IMAGE_THUMB_DIMENSION')
	},
	TZ: {
		description: 'Zona horaria de presentación (la persistencia siempre es UTC).',
		schema: z.string().min(1).default('UTC')
	},
	VAPID_PUBLIC_KEY: {
		public: true,
		description: 'Clave pública VAPID para registrar suscripciones Web Push (opcional).',
		schema: optionalString
	},
	VAPID_PRIVATE_KEY: {
		description: 'Clave privada VAPID. Solo en secretos de entorno (opcional).',
		schema: optionalString
	},
	VAPID_SUBJECT: {
		description: 'Contacto/operador usado como sujeto VAPID (opcional).',
		schema: optionalString
	}
});
