import { fail } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { orHttp } from '#lib/server/http';
import {
	assignUser,
	listAssignableUsers,
	listServiceAssignments,
	revokeAssignment
} from '#lib/server/domain/assignments';
import { getServiceForUser } from '#lib/server/domain/services';
import { failFrom, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import { assignUserSchema, revokeAssignmentSchema } from '#lib/schemas/services';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const admin = requireAdmin(locals);
	const serviceId = requireUuidParam(params.serviceId, 'Servicio');
	const db = getDatabase().db;

	const { service } = await orHttp(getServiceForUser(db, admin, serviceId));
	const [assignments, assignable] = await Promise.all([
		listServiceAssignments(db, serviceId),
		listAssignableUsers(db)
	]);

	return {
		title: service.name,
		service,
		assignments,
		technicians: assignable.filter((user) => user.role === 'technician'),
		supervisors: assignable.filter((user) => user.role === 'supervisor')
	};
};

export const actions: Actions = {
	assign: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(assignUserSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Datos de asignación inválidos.' });

		try {
			await assignUser(getDatabase().db, { ...parsed.data, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Asignación guardada.' };
	},

	revoke: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(revokeAssignmentSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Asignación inválida.' });

		try {
			await revokeAssignment(getDatabase().db, {
				assignmentId: parsed.data.assignmentId,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}

		return { success: 'Asignación revocada.' };
	}
};
