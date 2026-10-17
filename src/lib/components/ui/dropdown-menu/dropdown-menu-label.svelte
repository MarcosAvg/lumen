<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		inset?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="dropdown-menu-label"
	data-inset={inset}
	class={cn(
		'px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase data-inset:pl-9',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
