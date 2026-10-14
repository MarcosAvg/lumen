import type { Cookies } from '@sveltejs/kit';
import { getDatabase } from '#lib/server/db';
import { isSecureRequest, sessionExpiryFromNow, setSessionCookie } from './cookies';
import { insertSession } from './session';
import { generateSessionToken, hashSessionToken } from './token';

interface SessionContext {
	cookies: Cookies;
	url: URL;
	request: Request;
	getClientAddress: () => string;
}

/**
 * Crea una sesión de servidor, guarda el hash del token y emite la cookie.
 * El token en claro solo vive en la cookie (`HttpOnly`).
 */
export async function startSession(context: SessionContext, userId: string): Promise<void> {
	const token = generateSessionToken();
	const expiresAt = sessionExpiryFromNow();

	let ip: string | null;
	try {
		ip = context.getClientAddress();
	} catch {
		// La dirección del cliente puede no estar disponible (p. ej. en pruebas).
		ip = null;
	}

	await insertSession(getDatabase().db, {
		userId,
		tokenHash: hashSessionToken(token),
		expiresAt,
		userAgent: context.request.headers.get('user-agent'),
		ip
	});

	setSessionCookie(context.cookies, token, expiresAt, isSecureRequest(context.url));
}
