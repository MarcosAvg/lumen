import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '4173';
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Pruebas E2E de los flujos críticos en escritorio y móvil. El `webServer`
 * prepara la base de pruebas y arranca la app compilada.
 */
export default defineConfig({
	testDir: 'e2e',
	timeout: 45_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: [['list']],
	use: {
		baseURL,
		trace: 'on-first-retry'
	},
	projects: [
		{ name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
		{ name: 'movil', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: 'node scripts/e2e-server.mjs',
		url: `${baseURL}/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 240_000,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
