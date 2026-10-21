import type { ServiceLifecycle } from '#lib/types';

/** Filtro de lista: ciclo de vida o completado derivado. */
export type ServiceFilter = ServiceLifecycle | 'completed';

export interface ServiceFilterInput {
	lifecycle: ServiceLifecycle;
	completed: boolean;
}

/**
 * `completed` es un estado derivado, no un lifecycle. Activos y Completados
 * son excluyentes; el resto filtra por ciclo de vida.
 */
export function matchesServiceFilter(service: ServiceFilterInput, filter: ServiceFilter): boolean {
	if (filter === 'completed') return service.lifecycle === 'active' && service.completed;
	if (filter === 'active') return service.lifecycle === 'active' && !service.completed;
	return service.lifecycle === filter;
}
