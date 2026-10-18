import { expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { checkHealth, latestMigrationWhen } from '#lib/server/db/health';
import { describeWithDatabase } from './helpers/db';

await describeWithDatabase('HEALTH · migraciones aplicadas', ({ client }) => {
	it('HEALTH-01: una base migrada reporta salud correcta', async () => {
		const report = await checkHealth(client);
		expect(report).toMatchObject({
			status: 'ok',
			database: 'up',
			migrations: 'applied'
		});
	});

	it('HEALTH-02: una migración pendiente degrada la salud', async () => {
		const expected = await latestMigrationWhen();
		if (expected === null) throw new Error('No se pudo leer el journal de migraciones.');

		await expect(
			client.begin(async (tx) => {
				await tx`delete from drizzle.__drizzle_migrations where created_at = ${expected}`;
				const report = await checkHealth(tx as unknown as Sql);
				expect(report.status).toBe('degraded');
				expect(report.migrations).toBe('pending');
				// Fuerza el rollback para no alterar el estado de la BD de pruebas.
				throw new Error('rollback-health-check');
			})
		).rejects.toThrow('rollback-health-check');
	});
});
