import { expect, test } from '@playwright/test';

/** Cabeceras de seguridad y CSP en todas las respuestas. */
test('cabeceras de seguridad presentes', async ({ request }) => {
	// La CSP la añade SvelteKit a los documentos HTML (mode auto).
	const response = await request.get('/login');
	expect(response.status()).toBe(200);

	const headers = response.headers();
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['x-frame-options']).toBe('DENY');
	expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

	const csp = headers['content-security-policy'] ?? '';
	expect(csp).toContain("default-src 'self'");
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain("object-src 'none'");
});
