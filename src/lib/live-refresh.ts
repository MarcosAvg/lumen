/**
 * Refresco periódico de la interfaz (polling, sin WebSockets ni SSE).
 *
 * Las fichas de evidencia (`/works/...` y `/elements/...`) se excluyen del
 * refresco completo: una recarga automática mientras se suben o reordenan fotos
 * podría duplicar elementos o interrumpir la edición. En ellas solo se
 * actualizan los contadores del layout.
 */

/** Intervalo de refresco de la vista y los contadores. */
export const LIVE_REFRESH_MS = 30_000;

const EVIDENCE_ROUTE = /^\/(works|elements)\//;

export function isEvidencePage(pathname: string): boolean {
	return EVIDENCE_ROUTE.test(pathname);
}
