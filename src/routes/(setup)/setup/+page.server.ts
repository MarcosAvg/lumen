import { fail, redirect } from '@sveltejs/kit';
import { hashPassword } from '#lib/server/auth/password';
import { startSession } from '#lib/server/auth/start-session';
import { getDatabase } from '#lib/server/db';
import { createFirstAdmin, isSetupRequired } from '#lib/server/domain/users';
import { failFrom, parseForm } from '#lib/server/forms';
import { setupSchema } from '#lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (!(await isSetupRequired(getDatabase().db))) throw redirect(303, '/login');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const parsed = parseForm(setupSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { errors: parsed.errors });

		let userId: string;
		try {
			const passwordHash = await hashPassword(parsed.data.password);
			const created = await createFirstAdmin(getDatabase().db, {
				username: parsed.data.username,
				displayName: parsed.data.displayName,
				passwordHash
			});
			userId = created.id;
			await startSession(event, userId);
		} catch (error) {
			return failFrom(error);
		}

		throw redirect(303, '/dashboard');
	}
};
