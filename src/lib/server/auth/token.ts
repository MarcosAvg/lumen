import { createHash, randomBytes } from 'node:crypto';

/** Genera un token de sesión opaco (nunca se persiste en claro). */
export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/** Hash determinista del token; es lo único que se guarda en la base. */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}
