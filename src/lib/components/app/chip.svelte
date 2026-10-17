<script lang="ts" module>
	export type ChipTone = 'neutral' | 'attention' | 'pending' | 'approved' | 'rejected';
</script>

<script lang="ts">
	import { cn } from '#lib/utils.js';
	import type { Snippet } from 'svelte';

	/**
	 * Chip de estado/modo: fondo tenue + texto del color semántico, sin borde.
	 * Estilo único para estados y modos en toda la app.
	 */
	let {
		tone = 'neutral',
		class: className,
		children
	}: { tone?: ChipTone; class?: string; children?: Snippet } = $props();

	const tones: Record<ChipTone, string> = {
		neutral: 'bg-muted text-muted-foreground',
		attention: 'bg-state-attention/15 text-state-attention-ink',
		pending: 'bg-state-pending/15 text-state-pending-ink',
		approved: 'bg-state-approved/15 text-state-approved-ink',
		rejected: 'bg-state-rejected/15 text-state-rejected-ink'
	};
</script>

<span
	class={cn(
		'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
		tones[tone],
		className
	)}
>
	{@render children?.()}
</span>
