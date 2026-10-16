import type { Database } from '#lib/server/db';
import { createContract } from '#lib/server/domain/contracts';

/**
 * Crea un contrato con nombre único para las pruebas y devuelve su id.
 * Acepta un id de actor o un `SessionUser`.
 */
export async function seedContract(
	db: Database,
	actor: string | { id: string },
	name = 'Contrato'
): Promise<string> {
	const actorId = typeof actor === 'string' ? actor : actor.id;
	const { id } = await createContract(db, {
		name: `${name}-${Math.random().toString(36).slice(2, 8)}`,
		actorId
	});
	return id;
}
