import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	// `paths.origin` es el origen de confianza para CSRF y URLs absolutas.
	// Se fija en build (SvelteKit 3 no lee `ORIGIN` en runtime); en producción se
	// puede pasar como build-arg o dejar sin definir para derivarlo del proxy.
	const origin = process.env.ORIGIN || env.ORIGIN || undefined;

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				paths: { origin },
				// CSP compatible: SvelteKit añade nonces a sus scripts inline (mode auto).
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						'script-src': ['self'],
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:', 'blob:'],
						'font-src': ['self', 'data:'],
						'connect-src': ['self'],
						'object-src': ['none'],
						'base-uri': ['self'],
						'form-action': ['self'],
						'frame-ancestors': ['none'],
						'worker-src': ['self'],
						'manifest-src': ['self']
					}
				},
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter()
			})
		],
		test: {
			expect: { requireAssertions: true },
			projects: [
				{
					extends: './vite.config.ts',
					test: {
						name: 'unit',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				},
				{
					// Pruebas contra PostgreSQL real (transacciones, bloqueos, concurrencia).
					extends: './vite.config.ts',
					test: {
						name: 'integration',
						environment: 'node',
						include: ['tests/integration/**/*.{test,spec}.ts'],
						fileParallelism: false,
						testTimeout: 30000,
						hookTimeout: 60000
					}
				}
			]
		}
	};
});
