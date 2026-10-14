import { json } from '@sveltejs/kit';
import { checkHealth } from '$lib/server/db/health';
import type { RequestHandler } from './$types';

/**
 * Sonda de salud para balanceadores y healthchecks de contenedor.
 * Devuelve `200` cuando la base responde y las migraciones están aplicadas;
 * `503` en caso contrario, sin exponer detalles internos.
 */
export const GET: RequestHandler = async () => {
	const report = await checkHealth();
	return json(report, { status: report.status === 'ok' ? 200 : 503 });
};
