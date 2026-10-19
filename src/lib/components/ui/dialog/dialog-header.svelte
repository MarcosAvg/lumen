<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-header"
	class={cn(
		'flex shrink-0 flex-col gap-1.5 border-b border-border/60 px-5 pt-5 pr-14 pb-4 sm:px-6 sm:pt-6',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
