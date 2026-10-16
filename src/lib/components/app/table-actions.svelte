<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Grupo de acciones alineado a la derecha dentro de la celda «Acciones» de una
	 * tabla. Centraliza el patrón `flex items-center justify-end gap-2` para que
	 * todas las tablas queden uniformes.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<div class="flex items-center justify-end gap-2">{@render children()}</div>
