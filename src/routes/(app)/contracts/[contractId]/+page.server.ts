import { fail, redirect } from '@sveltejs/kit';
import sharp from 'sharp';
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
	getContractPdfContext,
	listContractAssignments,
	revokeContractAssignment,
	setContractPdfBackground,
	updateContract,
	updateContractPdfMargins
} from '#lib/server/domain/contracts';
import { listServicesByContract } from '#lib/server/domain/services';
import { listServiceProgress } from '#lib/server/domain/works';
import { failFrom, parseForm } from '#lib/server/forms';
import { requireUuidParam } from '#lib/server/params';
import {
	assignContractUserSchema,
	contractPdfMarginsSchema,
	revokeContractAssignmentSchema,
	updateContractSchema
} from '#lib/schemas/services';
import { storage } from '#lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;

export const load: PageServerLoad = async ({ params, locals }) => {
	const contractId = requireUuidParam(params.contractId, 'Contrato');
	requireUser(locals);
	const db = getDatabase().db;

	const access = await requireContractAccess(locals, contractId);
	const [assignments, services, assignable, pdfContext] = await Promise.all([
		listContractAssignments(db, contractId),
		listServicesByContract(db, contractId),
		access.canManage ? listAssignableUsers(db) : Promise.resolve([]),
		getContractPdfContext(db, contractId)
	]);

	// Avance por servicio y agregado del contrato, en una sola consulta.
	const progress = await listServiceProgress(
		db,
		services.map((service) => service.id)
	);
	let totalTargets = 0;
	let approvedTargets = 0;
	const servicesWithProgress = services.map((service) => {
		const entry = progress.get(service.id) ?? { totalTargets: 0, approvedTargets: 0 };
		totalTargets += entry.totalTargets;
		approvedTargets += entry.approvedTargets;
		return {
			...service,
			totalTargets: entry.totalTargets,
			approvedTargets: entry.approvedTargets,
			percent:
				entry.totalTargets === 0
					? 0
					: Math.round((entry.approvedTargets / entry.totalTargets) * 100)
		};
	});

	return {
		title: access.contract.name,
		back: { href: '/contracts', label: 'Contratos' },
		contract: access.contract,
		isAdmin: access.isAdmin,
		isSupervisor: access.isSupervisor,
		isTechnician: access.isTechnician,
		canManage: access.canManage,
		assignments,
		services: servicesWithProgress,
		progress: {
			totalTargets,
			approvedTargets,
			percent: totalTargets === 0 ? 0 : Math.round((approvedTargets / totalTargets) * 100),
			completed: totalTargets > 0 && approvedTargets === totalTargets
		},
		assignable,
		hasPdfBackground: Boolean(pdfContext.backgroundPath),
		pdfMargins: pdfContext.margins
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

	uploadBackground: async (event) => {
		const admin = requireAdmin(event.locals);
		const contractId = requireUuidParam(event.params.contractId, 'Contrato');
		const form = await event.request.formData();
		const file = form.get('background');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { backgroundMessage: 'Selecciona una imagen (PNG o JPG).' });
		}
		if (file.size > MAX_BACKGROUND_BYTES) {
			return fail(400, { backgroundMessage: 'La imagen supera 5 MB.' });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		let normalized: Buffer;
		try {
			normalized = await sharp(buffer)
				.rotate()
				.resize({ width: 2480, withoutEnlargement: true })
				.png({ compressionLevel: 9 })
				.toBuffer();
		} catch {
			return fail(400, { backgroundMessage: 'Formato de imagen no soportado.' });
		}

		try {
			const relPath = storage.backgroundRelPath(contractId);
			await storage.save(relPath, normalized);
			await setContractPdfBackground(getDatabase().db, {
				contractId,
				relPath,
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Fondo del PDF actualizado.' };
	},

	updateMargins: async (event) => {
		const admin = requireAdmin(event.locals);
		const parsed = parseForm(contractPdfMarginsSchema, await event.request.formData());
		if (!parsed.ok) {
			return fail(400, {
				marginErrors: parsed.errors,
				marginMessage: 'Revisa los márgenes (10–80 mm).'
			});
		}

		try {
			await updateContractPdfMargins(getDatabase().db, {
				contractId: parsed.data.contractId,
				margins: {
					top: parsed.data.marginTop,
					bottom: parsed.data.marginBottom,
					left: parsed.data.marginLeft,
					right: parsed.data.marginRight
				},
				actorId: admin.id
			});
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Márgenes del PDF guardados.' };
	},

	removeBackground: async (event) => {
		const admin = requireAdmin(event.locals);
		const contractId = requireUuidParam(event.params.contractId, 'Contrato');
		const db = getDatabase().db;

		try {
			const context = await getContractPdfContext(db, contractId);
			await setContractPdfBackground(db, { contractId, relPath: null, actorId: admin.id });
			if (context.backgroundPath) await storage.remove(context.backgroundPath);
		} catch (error) {
			return failFrom(error);
		}
		return { success: 'Fondo del PDF eliminado.' };
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
