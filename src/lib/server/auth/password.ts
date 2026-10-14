import { hash, verify } from '@node-rs/argon2';

// Argon2id es el algoritmo por defecto de @node-rs/argon2. Parámetros alineados
// con las recomendaciones de OWASP (19 MiB, 2 iteraciones).
const OPTIONS = {
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1
} as const;

export function hashPassword(password: string): Promise<string> {
	return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	try {
		return await verify(passwordHash, password);
	} catch {
		// Un hash corrupto o inválido no autentica.
		return false;
	}
}
