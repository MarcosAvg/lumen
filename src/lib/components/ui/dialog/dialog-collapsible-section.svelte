<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { Badge } from '#lib/components/ui/badge';
	import * as Collapsible from '#lib/components/ui/collapsible';
	import { cn } from '#lib/utils.js';
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		count,
		open = $bindable(false),
		class: className,
		children
	}: {
		title: string;
		description?: string;
		count?: number;
		open?: boolean;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<Collapsible.Root bind:open class={cn('rounded-xl border border-border bg-card', className)}>
	<Collapsible.Trigger
		class="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
	>
		<span class="min-w-0">
			<span class="block text-sm font-semibold text-foreground">{title}</span>
			{#if description}
				<span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
					{description}
				</span>
			{/if}
		</span>
		<span class="flex shrink-0 items-center gap-2">
			{#if count !== undefined}
				<Badge variant="secondary" class="tnum font-normal">{count}</Badge>
			{/if}
			<ChevronDown
				class={cn(
					'size-4 text-muted-foreground transition-transform duration-150',
					open && 'rotate-180'
				)}
				aria-hidden="true"
			/>
		</span>
	</Collapsible.Trigger>
	<Collapsible.Content class="border-t border-border/60 px-4 py-4">
		{@render children()}
	</Collapsible.Content>
</Collapsible.Root>
