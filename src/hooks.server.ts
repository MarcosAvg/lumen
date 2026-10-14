import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE } from '#lib/server/auth/cookies';
import { findActiveSession } from '#lib/server/auth/session';
import { hashSessionToken } from '#lib/server/auth/token';
import { getDatabase } from '#lib/server/db';

/**
 * Resuelve el usuario autenticado en cada petición validando la sesión y el
 * estado actual del usuario (`is_active` y rol) contra la base de datos. Nunca
 * se confían permisos almacenados en la cookie.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token
		? await findActiveSession(getDatabase().db, hashSessionToken(token))
		: null;

	return resolve(event);
};
