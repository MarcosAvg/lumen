import { beforeEach, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { hashPassword } from '#lib/server/auth/password';
import { DomainError } from '#lib/server/domain/errors';
import { createService } from '#lib/server/domain/services';
import { createFirstAdmin } from '#lib/server/domain/users';
import { createWork, listElementsDetailed } from '#lib/server/domain/works';
import { evidenceTargets } from '#lib/server/db/schema';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

await describeWithDatabase('Trabajos · creación con elementos', ({ db, client }) => {
	beforeEach(async () => {
		await truncateAll(client);
	});

	async function seedAdmin(): Promise<string> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
		return id;
	}

	it('crea un trabajo dividido con sus elementos y objetivos', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});

		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'divided',
			name: 'Piso 34',
			elements: [{ name: 'UMA 1' }, { name: 'UMA 2' }],
			actorId: admin
		});

		expect(work.targetId).toBeNull();
		expect(work.elementIds).toHaveLength(2);

		const elements = await listElementsDetailed(db, work.id);
		expect(elements.map((element) => element.name)).toEqual(['UMA 1', 'UMA 2']);

		// Sin objetivo en el padre dividido; dos objetivos en los elementos.
		expect(
			await db.select().from(evidenceTargets).where(eq(evidenceTargets.workId, work.id))
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(evidenceTargets)
				.where(inArray(evidenceTargets.elementId, work.elementIds))
		).toHaveLength(2);
	});

	it('un trabajo directo no admite elementos', async () => {
		const admin = await seedAdmin();
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});

		await expect(
			createWork(db, {
				serviceId: service.id,
				mode: 'direct',
				name: 'Trabajo',
				elements: [{ name: 'UMA 1' }],
				actorId: admin
			})
		).rejects.toBeInstanceOf(DomainError);
	});
});
