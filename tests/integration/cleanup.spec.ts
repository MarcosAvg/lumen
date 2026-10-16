import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { hashPassword } from '#lib/server/auth/password';
import { appendPhoto } from '#lib/server/domain/photos';
import { createService } from '#lib/server/domain/services';
import { createFirstAdmin } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { photos, pushSubscriptions } from '#lib/server/db/schema';
import { createStorage } from '#lib/server/storage/storage';
// Módulo de mantenimiento compartido con `scripts/cleanup.mjs`.
import { cleanupOrphans } from '../../scripts/lib/cleanup.mjs';
import { describeWithDatabase, TEST_DATABASE_URL, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

await describeWithDatabase('Limpieza de temporales y huérfanos', ({ db, client }) => {
	const tempRoots: string[] = [];

	beforeEach(async () => {
		await truncateAll(client);
	});

	afterAll(async () => {
		for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
	});

	it('borra huérfanos y temporales y conserva los binarios referenciados', async () => {
		const passwordHash = await hashPassword('contrasena-segura');
		const { id: admin } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Servicio',
			actorId: admin
		});
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo',
			actorId: admin
		});

		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-cleanup-'));
		tempRoots.push(dir);
		const storage = createStorage(dir);
		await storage.ensure();

		const png = await sharp({
			create: { width: 200, height: 150, channels: 3, background: { r: 10, g: 20, b: 30 } }
		})
			.png()
			.toBuffer();

		const { photo } = await appendPhoto(db, storage, {
			targetId: work.targetId as string,
			requirementId: null,
			buffer: png,
			userId: admin,
			maxDimension: 2560,
			thumbDimension: 400
		});

		await storage.save('objects/zz/zz/orphan.jpg', Buffer.from('huérfano'));
		await storage.save('staging/temporal.bin', Buffer.from('temporal'));

		const result = await cleanupOrphans({
			root: dir,
			databaseUrl: TEST_DATABASE_URL,
			minAgeMs: 0,
			stagingMaxAgeMs: 0
		});

		expect(result.orphansRemoved).toBe(1);
		expect(result.stagingRemoved).toBe(1);

		const [row] = await db.select().from(photos).where(eq(photos.id, photo.id));
		await expect(stat(storage.absolute(row.storagePath))).resolves.toBeTruthy();
		await expect(stat(storage.absolute(row.thumbnailPath))).resolves.toBeTruthy();
		await expect(stat(storage.absolute('objects/zz/zz/orphan.jpg'))).rejects.toThrow();
	});

	it('purga solo las suscripciones push revocadas antiguas', async () => {
		const passwordHash = await hashPassword('contrasena-segura');
		const { id: admin } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});

		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-cleanup-push-'));
		tempRoots.push(dir);
		await createStorage(dir).ensure();

		const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		await db.insert(pushSubscriptions).values([
			{ userId: admin, endpoint: 'https://push.example.com/active', p256dh: 'a', auth: 'b' },
			{
				userId: admin,
				endpoint: 'https://push.example.com/old',
				p256dh: 'a',
				auth: 'b',
				revokedAt: daysAgo(40)
			},
			{
				userId: admin,
				endpoint: 'https://push.example.com/recent',
				p256dh: 'a',
				auth: 'b',
				revokedAt: daysAgo(5)
			}
		]);

		const result = await cleanupOrphans({
			root: dir,
			databaseUrl: TEST_DATABASE_URL,
			pushRetentionDays: 30
		});
		expect(result.pushRevokedRemoved).toBe(1);

		const remaining = await db
			.select({ endpoint: pushSubscriptions.endpoint })
			.from(pushSubscriptions);
		expect(remaining.map((item) => item.endpoint).sort()).toEqual([
			'https://push.example.com/active',
			'https://push.example.com/recent'
		]);
	});
});
