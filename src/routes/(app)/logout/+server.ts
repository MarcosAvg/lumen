import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, isSecureRequest, SESSION_COOKIE } from '#lib/server/auth/cookies';
import { revokeSession } from '#lib/server/auth/session';
import { hashSessionToken } from '#lib/server/auth/token';
import { getDatabase } from '#lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, url }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		await revokeSession(getDatabase().db, hashSessionToken(token));
	}
	clearSessionCookie(cookies, isSecureRequest(url));
	throw redirect(303, '/login');
};
