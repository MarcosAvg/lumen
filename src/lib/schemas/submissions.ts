import { z } from 'zod';

/**
 * Cuerpo de la API de revisión: la decisión llega del cliente (validada) y, en
 * caso de rechazo, el motivo es obligatorio.
 */
export const reviewSchema = z
	.object({
		decision: z.enum(['approved', 'rejected'], { message: 'Decisión inválida.' }),
		reason: z
			.string()
			.trim()
			.max(2000, 'El motivo no puede superar 2000 caracteres.')
			.optional()
			.default('')
	})
	.refine((data) => data.decision !== 'rejected' || data.reason.length > 0, {
		path: ['reason'],
		message: 'El motivo del rechazo es obligatorio.'
	});

/**
 * Formulario de rechazo de la página de revisión: la decisión se fija en el
 * servidor, así que solo se valida el motivo (obligatorio).
 */
export const rejectSchema = z.object({
	reason: z
		.string()
		.trim()
		.min(1, 'El motivo del rechazo es obligatorio.')
		.max(2000, 'El motivo no puede superar 2000 caracteres.')
});
