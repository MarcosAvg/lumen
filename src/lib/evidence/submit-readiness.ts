/**
 * Regla de envío de evidencia (docs/02 §8), compartida por el servidor y la UI
 * para que la comprobación sea **idéntica** en ambos lados: si hay requisitos
 * obligatorios, cada uno necesita al menos una foto vigente; si no hay ninguno,
 * hace falta al menos una foto (en requisitos o en Adicionales).
 *
 * La UI la usa solo para *avisar* antes de enviar; la validación autoritativa
 * sigue siendo la del servidor.
 */

export interface SubmittableRequirement {
	id: string;
	name: string;
	isRequired: boolean;
}

export interface SubmittablePhoto {
	requirementId: string | null;
}

export interface SubmitReadiness {
	ready: boolean;
	/** Requisitos obligatorios sin ninguna foto (en el orden dado). */
	missingNames: string[];
	/** No hay requisitos obligatorios y no hay ninguna foto. */
	needsAnyPhoto: boolean;
}

export function submitReadiness(
	requirements: SubmittableRequirement[],
	photos: SubmittablePhoto[]
): SubmitReadiness {
	const required = requirements.filter((requirement) => requirement.isRequired);

	if (required.length === 0) {
		return { ready: photos.length > 0, missingNames: [], needsAnyPhoto: photos.length === 0 };
	}

	const countByRequirement = new Map<string, number>();
	for (const photo of photos) {
		if (photo.requirementId === null) continue;
		countByRequirement.set(
			photo.requirementId,
			(countByRequirement.get(photo.requirementId) ?? 0) + 1
		);
	}

	const missingNames = required
		.filter((requirement) => (countByRequirement.get(requirement.id) ?? 0) === 0)
		.map((requirement) => requirement.name);

	return { ready: missingNames.length === 0, missingNames, needsAnyPhoto: false };
}

/** Mensaje canónico para el primer requisito obligatorio sin evidencia. */
export function missingRequirementMessage(readiness: SubmitReadiness): string {
	if (readiness.needsAnyPhoto) return 'Añade al menos una fotografía para enviar.';
	const name = readiness.missingNames[0];
	return name
		? `Falta al menos una fotografía en «${name}».`
		: 'Falta evidencia obligatoria para enviar.';
}
