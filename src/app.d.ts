import type { SessionUser } from '#lib/types';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Usuario autenticado y activo, o `null` si no hay sesión válida. */
			user: SessionUser | null;
		}
	}
}

export {};
