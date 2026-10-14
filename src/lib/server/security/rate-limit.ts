/**
 * Limitador de tasa en memoria (ventana deslizante). Sin Redis: suficiente para
 * una instalación de un solo contenedor. **Limitación:** el estado es por
 * instancia; con varias réplicas cada una aplica su propio límite.
 */

export interface RateLimitRule {
	/** Máximo de eventos permitidos dentro de la ventana. */
	limit: number;
	/** Duración de la ventana en milisegundos. */
	windowMs: number;
}

export interface RateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
	remaining: number;
}

const buckets = new Map<string, number[]>();

/** Lee un límite configurable por entorno (positivo); si no, usa el valor por defecto. */
function envLimit(name: string, fallback: number): number {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Valores razonables y ajustables para equipos internos pequeños. */
export const LOGIN_RULE: RateLimitRule = {
	limit: envLimit('RATE_LIMIT_LOGIN_MAX', 10),
	windowMs: envLimit('RATE_LIMIT_LOGIN_WINDOW_MS', 15 * 60 * 1000)
};
export const SETUP_RULE: RateLimitRule = {
	limit: envLimit('RATE_LIMIT_SETUP_MAX', 10),
	windowMs: envLimit('RATE_LIMIT_SETUP_WINDOW_MS', 15 * 60 * 1000)
};
export const UPLOAD_RULE: RateLimitRule = {
	limit: envLimit('RATE_LIMIT_UPLOAD_MAX', 60),
	windowMs: envLimit('RATE_LIMIT_UPLOAD_WINDOW_MS', 60 * 1000)
};

/** Registra un intento y decide si se permite. */
export function consumeRateLimit(
	key: string,
	rule: RateLimitRule,
	now = Date.now()
): RateLimitResult {
	const windowStart = now - rule.windowMs;
	const hits = (buckets.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

	if (hits.length >= rule.limit) {
		buckets.set(key, hits);
		const retryAfterMs = (hits[0] ?? now) + rule.windowMs - now;
		return {
			allowed: false,
			retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
			remaining: 0
		};
	}

	hits.push(now);
	buckets.set(key, hits);
	return { allowed: true, retryAfterSeconds: 0, remaining: rule.limit - hits.length };
}

/** Solo para pruebas: limpia una clave o todos los buckets. */
export function resetRateLimits(key?: string): void {
	if (key) buckets.delete(key);
	else buckets.clear();
}
