import { error } from '@sveltejs/kit';
import { canExportZip, type SessionUser } from '#lib/types';
import { getDatabase } from '#lib/server/db';
import { orHttp } from '#lib/server/http';
import { getPhotoAccessContext, type PhotoAccessContext } from '#lib/server/domain/photos';
import { getServiceForUser, type ServiceAccessResult } from '#lib/server/domain/services';
import { getSubmissionContext, type SubmissionContext } from '#lib/server/domain/submissions';
import { getTargetContext, type TargetContext } from '#lib/server/domain/targets';

/** Exige una sesión activa; en su defecto responde `401`. */
export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) throw error(401, 'Necesitas iniciar sesión.');
	return locals.user;
}

/** Exige rol de administrador; en su defecto responde `403`. */
export function requireAdmin(locals: App.Locals): SessionUser {
	const user = requireUser(locals);
	if (user.role !== 'admin') throw error(403, 'No tienes permisos de administración.');
	return user;
}

/**
 * Autoriza la exportación de ZIP (entrega/servicio): administrador o supervisor.
 * Los técnicos no exportan (docs/01 §2); en su defecto responde `403`.
 */
export function requireExportZip(locals: App.Locals): SessionUser {
	const user = requireUser(locals);
	if (!canExportZip(user.role)) throw error(403, 'Los técnicos no pueden exportar evidencias.');
	return user;
}

/**
 * Resuelve el acceso a un servicio: administrador (global) o asignación activa
 * como técnico/supervisor. Fuera de ámbito responde `404` (opaco, sin filtrar).
 */
export async function requireServiceAccess(
	locals: App.Locals,
	serviceId: string
): Promise<ServiceAccessResult> {
	const user = requireUser(locals);
	return orHttp(getServiceForUser(getDatabase().db, user, serviceId));
}

/**
 * Autoriza la edición de evidencia: administrador o **técnico asignado**. Los
 * supervisores solo consultan y revisan (docs/01 §2).
 */
export async function requireCapture(locals: App.Locals, targetId: string): Promise<TargetContext> {
	const user = requireUser(locals);
	const target = await orHttp(getTargetContext(getDatabase().db, targetId));

	if (user.role !== 'admin') {
		const { access } = await orHttp(getServiceForUser(getDatabase().db, user, target.serviceId));
		if (access !== 'technician') {
			throw error(403, 'Solo los técnicos asignados pueden editar la evidencia.');
		}
	}

	return target;
}

/** Autoriza la descarga de una fotografía según el ámbito del servicio. */
export async function requirePhotoAccess(
	locals: App.Locals,
	photoId: string
): Promise<PhotoAccessContext> {
	const user = requireUser(locals);
	const photo = await orHttp(getPhotoAccessContext(getDatabase().db, photoId));
	// Lanza 404 opaco si el servicio queda fuera del ámbito del usuario.
	await orHttp(getServiceForUser(getDatabase().db, user, photo.serviceId));
	return photo;
}

/**
 * Autoriza la revisión de una entrega: administrador o **supervisor asignado**.
 * Los técnicos no revisan (docs/01 §2).
 */
export async function requireReview(
	locals: App.Locals,
	submissionId: string
): Promise<SubmissionContext> {
	const user = requireUser(locals);
	const context = await orHttp(getSubmissionContext(getDatabase().db, submissionId));

	if (user.role !== 'admin') {
		const { access } = await orHttp(getServiceForUser(getDatabase().db, user, context.serviceId));
		if (access !== 'supervisor') {
			throw error(403, 'Solo los supervisores asignados pueden revisar esta entrega.');
		}
	}

	return context;
}
