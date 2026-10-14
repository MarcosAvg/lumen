import { fail, redirect } from '@sveltejs/kit';
import { verifyPassword } from '#lib/server/auth/password';
import { startSession } from '#lib/server/auth/start-session';
import { getDatabase } from '#lib/server/db';
import { findUserForLogin, isSetupRequired } from '#lib/server/domain/users';
import { parseForm } from '#lib/server/forms';
import { consumeRateLimit, LOGIN_RULE } from '#lib/server/security/rate-limit';
import { loginSchema } from '#lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDatabase().db;
	if (await isSetupRequired(db)) throw redirect(303, '/setup');
	if (locals.user) throw redirect(303, '/dashboard');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const limit = consumeRateLimit(`login:${event.getClientAddress()}`, LOGIN_RULE);
		if (!limit.allowed) {
			return fail(429, { message: 'Demasiados intentos. Espera unos minutos.' });
		}

		const parsed = parseForm(loginSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { errors: parsed.errors });

		const user = await findUserForLogin(getDatabase().db, parsed.data.username);
		const valid = user ? await verifyPassword(user.passwordHash, parsed.data.password) : false;

		// Mensaje neutro: no revela si el usuario existe, está inactivo o la
		// contraseña es incorrecta.
		if (!user || !valid || !user.isActive) {
			return fail(400, { message: 'Credenciales inválidas.' });
		}

		await startSession(event, user.id);
		throw redirect(303, '/dashboard');
	}
};
