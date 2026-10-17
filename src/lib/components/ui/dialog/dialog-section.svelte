<script lang="ts">
	import { cn } from '#lib/utils.js';
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		description,
		class: className = '',
		children
	}: {
		eyebrow?: string;
		title?: string;
		description?: string;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<section class={cn('space-y-3', className)}>
	{#if eyebrow || title || description}
		<div class="space-y-1">
			{#if eyebrow}
				<p class="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
					{eyebrow}
				</p>
			{/if}
			{#if title}
				<h3 class="text-sm font-semibold text-foreground">{title}</h3>
			{/if}
			{#if description}
				<p class="text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>
	{/if}
	<div class="space-y-4">{@render children()}</div>
</section>
