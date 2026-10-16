import { beforeEach, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '#lib/server/auth/password';
import { findActiveSession, insertSession } from '#lib/server/auth/session';
import { hashSessionToken } from '#lib/server/auth/token';
import { assignUser } from '#lib/server/domain/assignments';
import { DomainError } from '#lib/server/domain/errors';
import { createService } from '#lib/server/domain/services';
import {
	changeUserRole,
	countActiveAdmins,
	createFirstAdmin,
	createUser,
	findUserForLogin,
	isSetupRequired,
	listIncompatibleAssignments,
	setUserActive,
	setUserPassword
} from '#lib/server/domain/users';
import { describeWithDatabase, truncateAll } from './helpers/db';
import { seedContract } from './helpers/contracts';

const PASSWORD = 'contrasena-segura';

await describeWithDatabase('AUTH · identidad, sesiones y último admin', ({ db, client }) => {
	beforeEach(async () => {
		await truncateAll(client);
	});

	async function seedAdmin(): Promise<string> {
		const passwordHash = await hashPassword(PASSWORD);
		const { id } = await createFirstAdmin(db, {
			username: 'Admin',
			displayName: 'Admin',
			passwordHash
		});
		return id;
	}

	async function seedUser(actorId: string, role: 'admin' | 'supervisor' | 'technician') {
		const passwordHash = await hashPassword(PASSWORD);
		return createUser(db, {
			username: `user-${role}-${Math.random().toString(36).slice(2, 8)}`,
			displayName: `Usuario ${role}`,
			passwordHash,
			role,
			actorId
		});
	}

	it('AUTH-05: no crea dos administradores iniciales ante solicitudes simultáneas', async () => {
		const passwordHash = await hashPassword(PASSWORD);
		const results = await Promise.allSettled([
			createFirstAdmin(db, { username: 'uno', displayName: 'Uno', passwordHash }),
			createFirstAdmin(db, { username: 'dos', displayName: 'Dos', passwordHash })
		]);

		const fulfilled = results.filter((result) => result.status === 'fulfilled');
		const rejected = results.filter((result) => result.status === 'rejected');

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DomainError);
		expect(await countActiveAdmins(db)).toBe(1);
		expect(await isSetupRequired(db)).toBe(false);
	});

	it('autentica con la contraseña correcta (usuario case-insensitive) y rechaza la incorrecta', async () => {
		const passwordHash = await hashPassword(PASSWORD);
		await createFirstAdmin(db, { username: 'Maria', displayName: 'María', passwordHash });

		const candidate = await findUserForLogin(db, 'MARIA');
		expect(candidate).not.toBeNull();
		expect(candidate?.username).toBe('maria');
		expect(await verifyPassword(candidate!.passwordHash, PASSWORD)).toBe(true);
		expect(await verifyPassword(candidate!.passwordHash, 'incorrecta')).toBe(false);
	});

	it('AUTH-04: desactivar invalida las sesiones activas', async () => {
		const admin = await seedAdmin();
		const user = await seedUser(admin, 'technician');

		const tokenHash = hashSessionToken('token-de-prueba');
		await insertSession(db, {
			userId: user.id,
			tokenHash,
			expiresAt: new Date(Date.now() + 60 * 60 * 1000)
		});
		expect(await findActiveSession(db, tokenHash)).not.toBeNull();

		await setUserActive(db, { userId: user.id, active: false, actorId: admin });
		expect(await findActiveSession(db, tokenHash)).toBeNull();
	});

	it('AUTH-05: protege al último administrador activo (desactivar y degradar)', async () => {
		const admin = await seedAdmin();

		await expect(
			setUserActive(db, { userId: admin, active: false, actorId: admin })
		).rejects.toBeInstanceOf(DomainError);

		await expect(
			changeUserRole(db, { userId: admin, role: 'technician', actorId: admin, confirmRevoke: true })
		).rejects.toBeInstanceOf(DomainError);

		expect(await countActiveAdmins(db)).toBe(1);
	});

	it('permite degradar a un administrador cuando queda otro activo', async () => {
		const admin = await seedAdmin();
		const second = await seedUser(admin, 'admin');

		await changeUserRole(db, {
			userId: second.id,
			role: 'technician',
			actorId: admin,
			confirmRevoke: true
		});

		expect(await countActiveAdmins(db)).toBe(1);
	});

	it('el cambio de rol exige confirmación y revoca asignaciones incompatibles', async () => {
		const admin = await seedAdmin();
		const supervisor = await seedUser(admin, 'supervisor');
		const service = await createService(db, {
			contractId: await seedContract(db, admin),
			name: 'Mantenimiento',
			actorId: admin
		});
		await assignUser(db, {
			serviceId: service.id,
			userId: supervisor.id,
			role: 'supervisor',
			actorId: admin
		});

		await expect(
			changeUserRole(db, {
				userId: supervisor.id,
				role: 'technician',
				actorId: admin,
				confirmRevoke: false
			})
		).rejects.toBeInstanceOf(DomainError);

		expect(await listIncompatibleAssignments(db, supervisor.id, 'technician')).toHaveLength(1);

		const result = await changeUserRole(db, {
			userId: supervisor.id,
			role: 'technician',
			actorId: admin,
			confirmRevoke: true
		});

		expect(result.revokedAssignmentIds).toHaveLength(1);
		expect(await listIncompatibleAssignments(db, supervisor.id, 'technician')).toHaveLength(0);
	});

	it('restablecer contraseña revoca las sesiones del usuario', async () => {
		const admin = await seedAdmin();
		const user = await seedUser(admin, 'technician');
		const tokenHash = hashSessionToken('otro-token');
		await insertSession(db, {
			userId: user.id,
			tokenHash,
			expiresAt: new Date(Date.now() + 60 * 60 * 1000)
		});

		await setUserPassword(db, {
			userId: user.id,
			passwordHash: await hashPassword('nueva-contrasena-larga'),
			actorId: admin
		});

		expect(await findActiveSession(db, tokenHash)).toBeNull();
	});

	it('rechaza nombres de usuario duplicados sin distinguir mayúsculas', async () => {
		const admin = await seedAdmin();
		await seedUser(admin, 'technician');
		const passwordHash = await hashPassword(PASSWORD);

		await expect(
			createUser(db, {
				username: 'ADMIN',
				displayName: 'Duplicado',
				passwordHash,
				role: 'technician',
				actorId: admin
			})
		).rejects.toBeInstanceOf(DomainError);
	});
});
