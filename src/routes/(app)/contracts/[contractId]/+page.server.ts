import { fail, redirect } from '@sveltejs/kit';
import {
	requireAdmin,
	requireContractAccess,
	requireContractManage,
	requireUser
} from '#lib/server/auth/guards';
import { getDatabase } from '#lib/server/db';
import { listAssignableUsers } from '#lib/server/domain/assignments';
import {
	assignContractUser,
	deleteContract,
	listContractAssignments,
	revokeContractAssignment,
	updateContract
} from '#lib/server/domain/contracts';
import { listServicesByContract } from '#lib/server/domain/services';
import { failFrom, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import {
	assignContractUserSchema,
	revokeContractAssignmentSchema,
	updateContractSchema
} from '#lib/schemas/services';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const contractId = requireUuidParam(params.contractId, 'Contrato');
	requireUser(locals);
	const db = getDatabase().db;

	const access = await requireContractAccess(locals, contractId);
	const [assignments, services, assignable] = await Promise.all([
		listContractAssignments(db, contractId),
		listServicesByContract(db, contractId),
		access.canManage ? listAssignableUsers(db) : Promise.resolve([])
	]);

	return {
		title: access.contract.name,
		contract: access.contract,
		isAdmin: access.isAdmin,
		canManage: access.canManage,
		assignments,
		services,
		assignable
	};
};

export const actions: Actions = {
	updateContract: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(updateContractSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Datos del contrato inválidos.' });

		try {
			await updateContract(getDatabase().db, { ...parsed.data, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Contrato actualizado.' };
	},

	deleteContract: async (event) => {
		const admin = requireAdmin(event.locals);
		const contractId = requireUuidParam(event.params.contractId, 'Contrato');

		try {
			await deleteContract(getDatabase().db, { contractId, actorId: admin.id });
		} catch (error) {
			return failFrom(error);
		}
		throw redirect(303, '/contracts');
	},

	assignMember: async (event) => {
		const contractId = requireUuidParam(event.params.contractId, 'Contrato');
		const parsed = parseForm(assignContractUserSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Datos de asignación inválidos.' });
		const db = getDatabase().db;

		try {
			const actor = requireUser(event.locals);
			await requireContractManage(event.locals, contractId);
			await assignContractUser(db, { ...parsed.data, contractId, actorId: actor.id });
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Participante añadido.' };
	},

	revokeMember: async (event) => {
		const contractId = requireUuidParam(event.params.contractId, 'Contrato');
		const parsed = parseForm(revokeContractAssignmentSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { message: 'Asignación inválida.' });
		const db = getDatabase().db;

		try {
			const actor = requireUser(event.locals);
			await requireContractManage(event.locals, contractId);
			await revokeContractAssignment(db, {
				assignmentId: parsed.data.assignmentId,
				actorId: actor.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return {
			success:
				'Participante revocado. Sus asignaciones de servicio en este contrato quedan revocadas.'
		};
	}
};
