import { z } from 'zod';

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
