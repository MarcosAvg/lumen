<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Cabecera de ficha: contexto, datos y acciones en una sola retícula.
	 * En móvil las acciones se apilan; en escritorio quedan a la derecha.
	 */
	let {
		children,
		actions,
		class: className = ''
	}: {
		children: Snippet;
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

<div
	data-slot="page-header"
	class="flex flex-col gap-4 pb-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8 lg:pb-5 {className}"
>
	<div class="min-w-0 space-y-2.5">{@render children()}</div>
	{#if actions}
		<div
			class="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end lg:w-auto lg:max-w-[65%] lg:shrink-0"
		>
			{@render actions()}
		</div>
	{/if}
</div>
