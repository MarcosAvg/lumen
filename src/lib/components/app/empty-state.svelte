<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Estado vacío consistente (compacto en escritorio, aireado en móvil). */
	let {
		title,
		description,
		children
	}: { title: string; description?: string; children?: Snippet } = $props();
</script>

<div
	class="flex flex-col items-start gap-3 rounded-xl border bg-card px-6 py-10 text-sm lg:items-center lg:py-12"
>
	<p class="font-medium text-foreground">{title}</p>
	{#if description}
		<p class="max-w-prose text-muted-foreground">{description}</p>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</div>
