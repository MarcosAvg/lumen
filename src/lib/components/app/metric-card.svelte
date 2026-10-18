<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import * as Card from '#lib/components/ui/card';
	import { cn } from '#lib/utils';

	/** Tarjeta de métrica con icono tintado, acento superior y valor o contenido. */
	let {
		label,
		value,
		Icon,
		tone = 'primary',
		class: className,
		children
	}: {
		label: string;
		value?: string | number;
		Icon: Component;
		tone?: 'primary' | 'teal' | 'pending' | 'rejected' | 'attention' | 'neutral';
		class?: string;
		children?: Snippet;
	} = $props();

	const tones = {
		primary: {
			icon: 'bg-primary/10 text-primary',
			bar: 'bg-primary'
		},
		teal: {
			icon: 'bg-teal/12 text-teal-ink',
			bar: 'bg-teal'
		},
		pending: {
			icon: 'bg-state-pending/15 text-state-pending-ink',
			bar: 'bg-state-pending'
		},
		rejected: {
			icon: 'bg-state-rejected/15 text-state-rejected-ink',
			bar: 'bg-state-rejected'
		},
		attention: {
			icon: 'bg-state-attention/15 text-state-attention-ink',
			bar: 'bg-state-attention'
		},
		neutral: {
			icon: 'bg-muted text-muted-foreground',
			bar: 'bg-border'
		}
	} as const;
</script>

<Card.Root class={cn('relative overflow-hidden', className)}>
	<span class="absolute inset-x-0 top-0 h-0.5 {tones[tone].bar}" aria-hidden="true"></span>
	<Card.Content class="space-y-3">
		<div class="flex items-start justify-between gap-3">
			<p class="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
				{label}
			</p>
			<span
				class="flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-current/10 ring-inset {tones[
					tone
				].icon}"
			>
				<Icon class="size-4" aria-hidden="true" />
			</span>
		</div>
		{#if children}
			{@render children()}
		{:else}
			<p class="tnum text-3xl font-semibold tracking-tight">{value}</p>
		{/if}
	</Card.Content>
</Card.Root>
