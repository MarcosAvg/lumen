import { describe, expect, it } from 'vitest';
import { rejectSchema, reviewSchema } from './submissions';

describe('esquema de rechazo (formulario)', () => {
	it('exige un motivo no vacío', () => {
		expect(rejectSchema.safeParse({ reason: '' }).success).toBe(false);
		expect(rejectSchema.safeParse({ reason: '   ' }).success).toBe(false);
		// El formulario no envía `decision`: no debe exigirla.
		expect(rejectSchema.safeParse({ reason: 'Falta la foto de después' }).success).toBe(true);
	});

	it('limita la longitud del motivo', () => {
		expect(rejectSchema.safeParse({ reason: 'x'.repeat(2001) }).success).toBe(false);
	});
});

describe('esquema de la API de revisión', () => {
	it('exige la decisión y el motivo al rechazar', () => {
		expect(reviewSchema.safeParse({ decision: 'rejected', reason: '' }).success).toBe(false);
		expect(reviewSchema.safeParse({ decision: 'rejected', reason: 'motivo' }).success).toBe(true);
		expect(reviewSchema.safeParse({ decision: 'approved' }).success).toBe(true);
		expect(reviewSchema.safeParse({}).success).toBe(false);
	});
});
