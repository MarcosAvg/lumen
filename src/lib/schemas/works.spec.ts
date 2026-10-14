import { describe, expect, it } from 'vitest';
import { createWorkElementSchema } from './works';

describe('elementos al crear un trabajo (validación)', () => {
	it('acepta exactamente un origen por elemento', () => {
		expect(createWorkElementSchema.safeParse({ name: 'UMA 1' }).success).toBe(true);
		expect(
			createWorkElementSchema.safeParse({ catalogItemId: '11111111-1111-4111-8111-111111111111' })
				.success
		).toBe(true);

		// Ninguno o ambos → inválido.
		expect(createWorkElementSchema.safeParse({ name: '' }).success).toBe(false);
		expect(
			createWorkElementSchema.safeParse({
				name: 'UMA 1',
				catalogItemId: '11111111-1111-4111-8111-111111111111'
			}).success
		).toBe(false);
	});
});
