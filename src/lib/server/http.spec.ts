import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { DomainError } from './domain/errors';
import { orHttp, toHttpError } from './http';

describe('traducción de errores de dominio a HTTP', () => {
	it('convierte DomainError en HttpError con su estado', async () => {
		try {
			await orHttp(Promise.reject(new DomainError(404, 'No encontrado.')));
			expect.unreachable('debería haber lanzado');
		} catch (cause) {
			expect(isHttpError(cause)).toBe(true);
			expect((cause as { status: number }).status).toBe(404);
		}
	});

	it('relanza los errores que no son de dominio', () => {
		const original = new Error('boom');
		expect(() => toHttpError(original)).toThrow(original);
	});
});
