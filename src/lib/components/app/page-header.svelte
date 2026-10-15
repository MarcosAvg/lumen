<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		children
	}: {
		title: string;
		description?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">{title}</h1>
		{#if description}
			<p class="max-w-prose text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if children}
		<div class="flex flex-wrap items-center gap-2">{@render children()}</div>
	{/if}
</div>
