import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '4173';
const baseURL = `http://127.0.0.1:${PORT}`;
const adminStorageState = '.e2e/admin-storage.json';

/**
 * Pruebas E2E de los flujos críticos.
 *
 * Por defecto `pnpm test:e2e` ejecuta todo escritorio y una selección móvil
 * marcada con `@mobile`. `pnpm test:e2e:all` ejecuta también el resto de móvil.
 * La autenticación se prepara una sola vez en el proyecto `setup`.
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
		{
			name: 'setup',
			testMatch: /auth\.setup\.ts/,
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'escritorio',
			use: { ...devices['Desktop Chrome'], storageState: adminStorageState },
			dependencies: ['setup']
		},
		{
			name: 'movil',
			use: { ...devices['Pixel 7'], storageState: adminStorageState },
			dependencies: ['setup'],
			grep: /@mobile/
		},
		{
			name: 'movil-completo',
			use: { ...devices['Pixel 7'], storageState: adminStorageState },
			dependencies: ['setup'],
			grepInvert: /@mobile/
		}
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
