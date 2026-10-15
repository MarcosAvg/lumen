<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Bloque de introducción de página: descripción (solo escritorio) y acciones.
	 * El **título de la vista vive en la cabecera** de la app, así que aquí ya no
	 * se repite el `h1`.
	 */
	let {
		description,
		children
	}: {
		description?: string;
		children?: Snippet;
	} = $props();
</script>

{#if description || children}
	<div
		class="flex flex-col gap-2 border-b pb-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6 lg:pb-5 {children
			? ''
			: 'max-lg:hidden'}"
	>
		{#if description}
			<p class="hidden max-w-prose text-sm text-muted-foreground lg:block">{description}</p>
		{/if}
		{#if children}
			<div class="flex flex-wrap items-center gap-2">{@render children()}</div>
		{/if}
	</div>
{/if}
