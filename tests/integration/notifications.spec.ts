import { seedContract } from './helpers/contracts';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { hashPassword } from '#lib/server/auth/password';
import { assignUser, revokeAssignment } from '#lib/server/domain/assignments';
import { DomainError } from '#lib/server/domain/errors';
import {
	assertValidSubscription,
	countPushSubscriptions,
	dispatchPushToUsers,
	isPushConfigured,
	removePushSubscription,
	savePushSubscription
} from '#lib/server/domain/push';
import {
	createSubmissionNotifications,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	unreadNotificationCount
} from '#lib/server/domain/notifications';
import { appendPhoto } from '#lib/server/domain/photos';
import { createService, getServiceForUser } from '#lib/server/domain/services';
import { deleteService } from '#lib/server/domain/structure';
import { reviewSubmission, submitEvidence } from '#lib/server/domain/submissions';
import { createFirstAdmin, createUser, setUserActive } from '#lib/server/domain/users';
import { createWork } from '#lib/server/domain/works';
import { notifications } from '#lib/server/db/schema';
import { createStorage, type Storage } from '#lib/server/storage/storage';
import { describeWithDatabase, truncateAll } from './helpers/db';

const PASSWORD = 'contrasena-segura';

async function png(): Promise<Buffer> {
	return sharp({
		create: { width: 60, height: 40, channels: 3, background: { r: 30, g: 90, b: 150 } }
	})
		.png()
		.toBuffer();
}

await describeWithDatabase('Notificaciones y Web Push', ({ db, client }) => {
	const tempRoots: string[] = [];

	beforeEach(async () => {
		await truncateAll(client);
	});

	afterAll(async () => {
		for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
	});

	async function makeStorage(): Promise<Storage> {
		const dir = await mkdtemp(path.join(tmpdir(), 'lumen-notif-'));
		tempRoots.push(dir);
		const storage = createStorage(dir);
		await storage.ensure();
		return storage;
	}

	async function seedAdmin(): Promise<string> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createFirstAdmin(db, {
			username: 'admin',
			displayName: 'Admin',
			passwordHash
		});
		return id;
	}

	async function makeUser(
		role: 'technician' | 'supervisor',
		username: string,
		actorId: string
	): Promise<string> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createUser(db, {
			username,
			displayName: username,
			passwordHash,
			role,
			actorId
		});
		return id;
	}

	async function makeAdmin(username: string, actorId: string): Promise<string> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createUser(db, {
			username,
			displayName: username,
			passwordHash,
			role: 'admin',
			actorId
		});
		return id;
	}

	async function seedServiceWithDirectWork(actorId: string) {
		const service = await createService(db, {
			contractId: await seedContract(db, actorId),
			name: 'Servicio',
			actorId
		});
		const work = await createWork(db, {
			serviceId: service.id,
			mode: 'direct',
			name: 'Trabajo',
			actorId
		});
		return { serviceId: service.id, targetId: work.targetId as string, workId: work.id };
	}

	async function submit(storage: Storage, targetId: string, userId: string) {
		const photo = await appendPhoto(db, storage, {
			targetId,
			requirementId: null,
			buffer: await png(),
			userId,
			maxDimension: 2560,
			thumbDimension: 400
		});
		return submitEvidence(db, { targetId, expectedVersion: photo.version, userId });
	}

	it('la entrega notifica a supervisores y administradores (excepto al emisor)', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const { serviceId, targetId } = await seedServiceWithDirectWork(admin);

		const supervisor = await makeUser('supervisor', 'sup-ok', admin);
		const otherSupervisor = await makeUser('supervisor', 'sup-otro', admin);
		const inactiveSupervisor = await makeUser('supervisor', 'sup-inactivo', admin);
		const technician = await makeUser('technician', 'tec', admin);
		await assignUser(db, { serviceId, userId: supervisor, role: 'supervisor', actorId: admin });
		await assignUser(db, {
			serviceId,
			userId: inactiveSupervisor,
			role: 'supervisor',
			actorId: admin
		});
		await setUserActive(db, { userId: inactiveSupervisor, active: false, actorId: admin });
		await assignUser(db, { serviceId, userId: technician, role: 'technician', actorId: admin });

		const submission = await submit(storage, targetId, technician);

		const forSupervisor = await listNotifications(db, supervisor);
		expect(forSupervisor).toHaveLength(1);
		expect(forSupervisor[0].eventType).toBe('submission.submitted');
		expect(forSupervisor[0].deepLink).toBe(`/submissions/${submission.submissionId}`);
		expect(await unreadNotificationCount(db, supervisor)).toBe(1);

		expect(await listNotifications(db, otherSupervisor)).toHaveLength(0);
		expect(await listNotifications(db, inactiveSupervisor)).toHaveLength(0);
		// El técnico que envía no recibe la notificación de envío.
		expect(await listNotifications(db, technician)).toHaveLength(0);

		// El administrador activo también la recibe (ámbito global).
		const forAdmin = await listNotifications(db, admin);
		expect(forAdmin).toHaveLength(1);
		expect(forAdmin[0].eventType).toBe('submission.submitted');
	});

	it('la notificación de entrega es idempotente por destinatario y evento', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const { serviceId, targetId } = await seedServiceWithDirectWork(admin);
		const supervisor = await makeUser('supervisor', 'sup', admin);
		await assignUser(db, { serviceId, userId: supervisor, role: 'supervisor', actorId: admin });

		const submission = await submit(storage, targetId, admin);

		// El administrador que envía no recibe su propia notificación.
		expect(await listNotifications(db, admin)).toHaveLength(0);

		const before = await db
			.select()
			.from(notifications)
			.where(eq(notifications.recipientUserId, supervisor));
		expect(before).toHaveLength(1);

		// Un reintento con la misma clave de evento no duplica.
		await createSubmissionNotifications(db, {
			serviceId,
			targetId,
			submissionId: submission.submissionId,
			sequenceNo: submission.sequenceNo,
			serviceName: 'Servicio',
			workName: 'Trabajo',
			label: 'Trabajo',
			actorId: admin
		});
		expect(await listNotifications(db, admin)).toHaveLength(0);
		const after = await db
			.select()
			.from(notifications)
			.where(eq(notifications.recipientUserId, supervisor));
		expect(after).toHaveLength(1);
	});

	it('la revisión notifica a técnicos y administradores (excepto al revisor)', async () => {
		const admin = await seedAdmin();
		const otherAdmin = await makeAdmin('admin-2', admin);
		const storage = await makeStorage();
		const { serviceId, targetId, workId } = await seedServiceWithDirectWork(admin);

		const technician = await makeUser('technician', 'tec-ok', admin);
		const otherTechnician = await makeUser('technician', 'tec-otro', admin);
		const inactiveTechnician = await makeUser('technician', 'tec-inactivo', admin);
		const supervisor = await makeUser('supervisor', 'sup', admin);
		await assignUser(db, { serviceId, userId: technician, role: 'technician', actorId: admin });
		await assignUser(db, {
			serviceId,
			userId: inactiveTechnician,
			role: 'technician',
			actorId: admin
		});
		await setUserActive(db, { userId: inactiveTechnician, active: false, actorId: admin });
		await assignUser(db, { serviceId, userId: supervisor, role: 'supervisor', actorId: admin });

		const submission = await submit(storage, targetId, technician);
		await reviewSubmission(db, {
			submissionId: submission.submissionId,
			decision: 'approved',
			reviewerId: admin
		});

		const forTechnician = await listNotifications(db, technician);
		expect(forTechnician).toHaveLength(1);
		expect(forTechnician[0].eventType).toBe('submission.approved');
		expect(forTechnician[0].deepLink).toBe(`/works/${workId}`);

		expect(await listNotifications(db, otherTechnician)).toHaveLength(0);
		expect(await listNotifications(db, inactiveTechnician)).toHaveLength(0);
		// El supervisor solo recibe el aviso de entrega, no el de decisión.
		expect(await listNotifications(db, supervisor)).toHaveLength(1);

		// El revisor (admin) recibe la entrega, pero no su propia decisión.
		const forReviewer = await listNotifications(db, admin);
		expect(forReviewer).toHaveLength(1);
		expect(forReviewer[0].eventType).toBe('submission.submitted');

		// Otro administrador activo recibe ambos eventos.
		const forOtherAdmin = await listNotifications(db, otherAdmin);
		expect(forOtherAdmin.map((item) => item.eventType).sort()).toEqual([
			'submission.approved',
			'submission.submitted'
		]);
	});

	it('marcar leído solo afecta a las notificaciones propias', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const { serviceId, targetId } = await seedServiceWithDirectWork(admin);
		const supervisor = await makeUser('supervisor', 'sup', admin);
		await assignUser(db, { serviceId, userId: supervisor, role: 'supervisor', actorId: admin });

		await submit(storage, targetId, admin);
		const [notification] = await listNotifications(db, supervisor);

		// Otro usuario no puede marcarla.
		expect(await markNotificationRead(db, admin, notification.id)).toBe(false);
		expect(await unreadNotificationCount(db, supervisor)).toBe(1);

		expect(await markNotificationRead(db, supervisor, notification.id)).toBe(true);
		expect(await unreadNotificationCount(db, supervisor)).toBe(0);

		// `markAll` no reabre nada y es seguro con cero pendientes.
		expect(await markAllNotificationsRead(db, supervisor)).toBe(0);
	});

	it('el borrado destructivo del servicio elimina las notificaciones vinculadas', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const { serviceId, targetId } = await seedServiceWithDirectWork(admin);
		const supervisor = await makeUser('supervisor', 'sup', admin);
		await assignUser(db, { serviceId, userId: supervisor, role: 'supervisor', actorId: admin });

		await submit(storage, targetId, admin);
		expect(await listNotifications(db, supervisor)).toHaveLength(1);

		await deleteService(db, { serviceId, actorId: admin });
		expect(await listNotifications(db, supervisor)).toHaveLength(0);
		expect(await db.select().from(notifications)).toHaveLength(0);
	});

	it('gestiona suscripciones push por dispositivo y reasigna endpoints', async () => {
		const admin = await seedAdmin();
		const other = await makeUser('technician', 'tec', admin);
		const endpoint = 'https://push.example.com/subscription/abc';
		const base = { endpoint, p256dh: 'p256dh-key', auth: 'auth-secret' };

		await savePushSubscription(db, admin, base);
		expect(await countPushSubscriptions(db, admin)).toBe(1);

		// Re-registrar el mismo endpoint desde otra cuenta lo reasigna.
		await savePushSubscription(db, other, { ...base, p256dh: 'otra' });
		expect(await countPushSubscriptions(db, admin)).toBe(0);
		expect(await countPushSubscriptions(db, other)).toBe(1);

		expect(await removePushSubscription(db, admin, endpoint)).toBe(false);
		expect(await removePushSubscription(db, other, endpoint)).toBe(true);
		expect(await countPushSubscriptions(db, other)).toBe(0);
	});

	it('NOTIF-01: el push es best-effort y la notificación interna persiste', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const { serviceId, targetId } = await seedServiceWithDirectWork(admin);
		const supervisor = await makeUser('supervisor', 'sup', admin);
		await assignUser(db, { serviceId, userId: supervisor, role: 'supervisor', actorId: admin });

		// Endpoint ficticio que falla rápido (conexión rechazada) para no depender de la red.
		await savePushSubscription(db, supervisor, {
			endpoint: 'https://127.0.0.1:1/push',
			p256dh: 'k',
			auth: 'a'
		});

		const configured = isPushConfigured();
		const dispatch = await dispatchPushToUsers(db, [supervisor], {
			title: 't',
			body: 'b',
			url: '/',
			tag: 'x'
		});

		// Sin VAPID el envío se omite; con VAPID se intenta y falla sin lanzar ni entregar.
		expect(dispatch.skipped).toBe(!configured);
		expect(dispatch.sent).toBe(0);

		// La entrega y la notificación interna no se ven afectadas.
		await submit(storage, targetId, admin);
		expect(await listNotifications(db, supervisor)).toHaveLength(1);
	});

	it('valida la forma de una suscripción push', () => {
		expect(() =>
			assertValidSubscription({ endpoint: 'http://inseguro', p256dh: 'k', auth: 'a' })
		).toThrow(DomainError);
		expect(() =>
			assertValidSubscription({ endpoint: 'https://ok', p256dh: '', auth: 'a' })
		).toThrow(DomainError);
		expect(() =>
			assertValidSubscription({ endpoint: 'https://ok', p256dh: 'k', auth: 'a' })
		).not.toThrow();
	});

	it('NOTIF-02: tras revocar el acceso, el enlace profundo ya no autoriza el recurso', async () => {
		const admin = await seedAdmin();
		const storage = await makeStorage();
		const { serviceId, targetId } = await seedServiceWithDirectWork(admin);
		const supervisor = await makeUser('supervisor', 'sup', admin);
		const { id: assignmentId } = await assignUser(db, {
			serviceId,
			userId: supervisor,
			role: 'supervisor',
			actorId: admin
		});

		await submit(storage, targetId, admin);
		expect(await listNotifications(db, supervisor)).toHaveLength(1);

		// Se revoca la asignación: el recurso enlazado deja de estar autorizado.
		await revokeAssignment(db, { assignmentId, actorId: admin });
		const supervisorUser = {
			id: supervisor,
			username: 'sup',
			displayName: 'sup',
			role: 'supervisor' as const
		};
		await expect(getServiceForUser(db, supervisorUser, serviceId)).rejects.toBeInstanceOf(
			DomainError
		);
	});
});
