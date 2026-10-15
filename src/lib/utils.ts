export { cn } from 'cn';

/** Antigüedad relativa en español (p. ej. «hace 2 h»). */
export function formatRelativeAge(value: Date | string, now: number = Date.now()): string {
	const diff = Math.max(0, now - new Date(value).getTime());
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return 'hace menos de 1 min';
	if (minutes < 60) return `hace ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `hace ${hours} h`;
	const days = Math.floor(hours / 24);
	return `hace ${days} d`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
