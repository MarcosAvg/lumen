/**
 * Extrae el código SQLSTATE de un error de PostgreSQL. Drizzle envuelve los
 * errores del driver, por lo que el código puede estar en `cause`.
 */
export function getPgErrorCode(error: unknown): string | undefined {
	const candidate = error as { code?: string; cause?: { code?: string } } | null | undefined;
	return candidate?.code ?? candidate?.cause?.code;
}
