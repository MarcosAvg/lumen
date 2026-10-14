/** Error de dominio con un estado HTTP sugerido y detalles opcionales. */
export class DomainError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly details?: unknown
	) {
		super(message);
		this.name = 'DomainError';
	}
}

export function isDomainError(error: unknown): error is DomainError {
	return error instanceof DomainError;
}
