<script lang="ts">
	import { cn } from '#lib/utils.js';

	interface ContextItem {
		label: string;
		value: string;
		strong?: boolean;
	}

	let {
		items = [],
		class: className,
		children
	}: {
		items?: ContextItem[];
		class?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<div
	data-slot="dialog-context"
	class={cn(
		'flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-border/60 bg-muted/20 px-5 py-2.5 text-xs sm:px-6',
		className
	)}
>
	{#each items as item (item.label)}
		<span class="inline-flex min-w-0 items-baseline gap-1.5">
			<span class="text-muted-foreground">{item.label}</span>
			<span
				class={cn('truncate', item.strong ? 'font-semibold text-foreground' : 'text-foreground/80')}
			>
				{item.value}
			</span>
		</span>
	{/each}
	{@render children?.()}
</div>
