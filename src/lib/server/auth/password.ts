import { hash, verify } from '@node-rs/argon2';

// Argon2id es el algoritmo por defecto de @node-rs/argon2. Parámetros alineados
// con las recomendaciones de OWASP (19 MiB, 2 iteraciones).
const PRODUCTION_OPTIONS = {
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1
} as const;

/**
 * Vitest ejecuta decenas de altas de usuario. Bajar el coste solo dentro de la
 * suite mantiene las pruebas rápidas sin alterar la seguridad en producción.
 */
const TEST_OPTIONS = {
	memoryCost: 4096,
	timeCost: 1,
	parallelism: 1
} as const;

const OPTIONS = process.env.VITEST ? TEST_OPTIONS : PRODUCTION_OPTIONS;

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
