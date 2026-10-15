import { fail } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { hashPassword } from '#lib/server/auth/password';
import { getDatabase } from '#lib/server/db';
import {
	changeUserRole,
	createUser,
	listUsers,
	setUserActive,
	setUserPassword,
	updateUserProfile
} from '#lib/server/domain/users';
import { failFrom, parseForm } from '#lib/server/forms';
import {
	changeRoleSchema,
	createUserSchema,
	resetPasswordSchema,
	updateUserProfileSchema,
	userTargetSchema
} from '#lib/schemas/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	return { title: 'Usuarios', users: await listUsers(getDatabase().db) };
};

export const actions: Actions = {
	create: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(createUserSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { createErrors: parsed.errors });

		try {
			const passwordHash = await hashPassword(parsed.data.password);
			await createUser(getDatabase().db, {
				username: parsed.data.username,
				displayName: parsed.data.displayName,
				passwordHash,
				role: parsed.data.role,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Usuario creado.' };
	},

	activate: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(userTargetSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Usuario inválido.' });

		try {
			await setUserActive(getDatabase().db, {
				userId: parsed.data.userId,
				active: true,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Usuario activado.' };
	},

	deactivate: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(userTargetSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Usuario inválido.' });

		try {
			await setUserActive(getDatabase().db, {
				userId: parsed.data.userId,
				active: false,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Usuario desactivado.' };
	},

	changeRole: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(changeRoleSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Datos de rol inválidos.' });

		try {
			const result = await changeUserRole(getDatabase().db, {
				userId: parsed.data.userId,
				role: parsed.data.role,
				actorId: admin.id,
				confirmRevoke: parsed.data.confirmRevoke === 'true'
			});
			return {
				success:
					result.revokedAssignmentIds.length > 0
						? `Rol actualizado. Se revocaron ${result.revokedAssignmentIds.length} asignación(es) incompatible(s).`
						: 'Rol actualizado.'
			};
		} catch (error) {
			return failFrom(error);
		}
	},

	updateProfile: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(updateUserProfileSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { profileErrors: parsed.errors });

		try {
			await updateUserProfile(getDatabase().db, { ...parsed.data, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Usuario actualizado.' };
	},

	resetPassword: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(resetPasswordSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { resetErrors: parsed.errors });

		try {
			const passwordHash = await hashPassword(parsed.data.password);
			await setUserPassword(getDatabase().db, {
				userId: parsed.data.userId,
				passwordHash,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Contraseña restablecida. Se cerraron sus sesiones.' };
	}
};
