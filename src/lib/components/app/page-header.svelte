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

<div
	class="flex flex-col gap-2 border-b pb-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6 lg:pb-5"
>
	<div class="space-y-1">
		<h1 class="text-xl font-semibold tracking-tight lg:text-3xl">{title}</h1>
		{#if description}
			<p class="hidden max-w-prose text-sm text-muted-foreground lg:block">{description}</p>
		{/if}
	</div>
	{#if children}
		<div class="flex flex-wrap items-center gap-2">{@render children()}</div>
	{/if}
</div>
