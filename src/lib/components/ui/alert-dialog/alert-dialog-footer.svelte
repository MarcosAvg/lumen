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
	data-slot="alert-dialog-footer"
	class={cn(
		'-mx-5 -mb-5 flex flex-col gap-2 rounded-b-xl bg-muted/30 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end sm:pb-5',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
