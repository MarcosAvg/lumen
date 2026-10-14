import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE = 'lumen_session';

/** Duración de una sesión: 30 días. */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function sessionExpiryFromNow(): Date {
	return new Date(Date.now() + SESSION_TTL_MS);
}

export function setSessionCookie(
	cookies: Cookies,
	token: string,
	expiresAt: Date,
	secure: boolean
): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies, secure: boolean): void {
	cookies.delete(SESSION_COOKIE, { path: '/', secure });
}

/** Las cookies `Secure` solo tienen sentido sobre HTTPS (o localhost en desarrollo). */
export function isSecureRequest(url: URL): boolean {
	return url.protocol === 'https:';
}
