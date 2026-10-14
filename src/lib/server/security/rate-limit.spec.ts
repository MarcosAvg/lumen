import { describe, expect, it } from 'vitest';
import { consumeRateLimit, resetRateLimits } from './rate-limit';

describe('rate limit (ventana deslizante en memoria)', () => {
	it('permite hasta el límite y luego bloquea con Retry-After', () => {
		resetRateLimits();
		const rule = { limit: 3, windowMs: 1000 };

		expect(consumeRateLimit('k', rule, 0).allowed).toBe(true);
		expect(consumeRateLimit('k', rule, 1).allowed).toBe(true);
		expect(consumeRateLimit('k', rule, 2).remaining).toBe(0);

		const blocked = consumeRateLimit('k', rule, 3);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

		// Pasada la ventana, vuelve a permitir.
		expect(consumeRateLimit('k', rule, 1001).allowed).toBe(true);
	});

	it('aísla claves distintas', () => {
		resetRateLimits();
		const rule = { limit: 1, windowMs: 1000 };
		expect(consumeRateLimit('a', rule, 0).allowed).toBe(true);
		expect(consumeRateLimit('a', rule, 0).allowed).toBe(false);
		expect(consumeRateLimit('b', rule, 0).allowed).toBe(true);
	});
});
