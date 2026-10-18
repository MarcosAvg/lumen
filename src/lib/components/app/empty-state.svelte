<script lang="ts">
	import Inbox from '@lucide/svelte/icons/inbox';
	import { cn } from '#lib/utils';
	import type { Component, Snippet } from 'svelte';

	/** Estado vacío consistente con un ancla visual y una acción opcional. */
	let {
		title,
		description,
		Icon = Inbox,
		tone = 'primary',
		class: className,
		children
	}: {
		title: string;
		description?: string;
		Icon?: Component;
		tone?: 'primary' | 'approved' | 'pending' | 'rejected' | 'neutral';
		class?: string;
		children?: Snippet;
	} = $props();

	const tones = {
		primary: 'bg-primary/10 text-primary',
		approved: 'bg-state-approved/15 text-state-approved-ink',
		pending: 'bg-state-pending/15 text-state-pending-ink',
		rejected: 'bg-state-rejected/15 text-state-rejected-ink',
		neutral: 'bg-muted text-muted-foreground'
	} as const;
</script>

<div
	class={cn(
		'flex flex-col gap-4 rounded-xl border border-dashed border-border bg-surface-inset px-6 py-8 sm:flex-row sm:items-start',
		className
	)}
>
	<span
		class={cn(
			'flex size-11 shrink-0 items-center justify-center rounded-lg ring-1 ring-current/10 ring-inset',
			tones[tone]
		)}
	>
		<Icon class="size-5" aria-hidden="true" />
	</span>
	<div class="min-w-0 flex-1 space-y-1">
		<p class="font-medium text-foreground">{title}</p>
		{#if description}
			<p class="max-w-prose text-sm text-muted-foreground">{description}</p>
		{/if}
		{#if children}
			<div class="pt-2">{@render children()}</div>
		{/if}
	</div>
</div>
