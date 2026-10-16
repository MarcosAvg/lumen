import { fail } from '@sveltejs/kit';
import { requireAdmin, requireUser } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { createContract, listContractsForUser } from '#lib/server/domain/contracts';
import { failFrom, parseForm } from '#lib/server/forms';
import { createContractSchema } from '#lib/schemas/services';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const db = getDatabase().db;
	const contracts = await listContractsForUser(db, user);
	return { title: 'Contratos', contracts, isAdmin: user.role === 'admin' };
};

export const actions: Actions = {
	create: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(createContractSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { createErrors: parsed.errors });

		try {
			await createContract(getDatabase().db, {
				name: parsed.data.name,
				description: parsed.data.description,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Contrato creado.' };
	}
};
