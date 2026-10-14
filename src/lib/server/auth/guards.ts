import { error } from '@sveltejs/kit';
import type { SessionUser } from '#lib/types';
import { getDatabase } from '#lib/server/db';
import { getServiceForUser, type ServiceAccessResult } from '#lib/server/domain/services';

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
 * Resuelve el acceso a un servicio: administrador (global) o asignación activa
 * como técnico/supervisor. Fuera de ámbito responde `404` (opaco, sin filtrar).
 */
export async function requireServiceAccess(
	locals: App.Locals,
	serviceId: string
): Promise<ServiceAccessResult> {
	const user = requireUser(locals);
	return getServiceForUser(getDatabase().db, user, serviceId);
}
