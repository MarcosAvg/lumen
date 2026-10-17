<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		showCloseButton = false,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		showCloseButton?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-footer"
	class={cn(
		'mt-auto flex shrink-0 flex-col gap-2 bg-muted/30 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4',
		className
	)}
	{...restProps}
>
	{@render children?.()}
	{#if showCloseButton}
		<DialogPrimitive.Close>
			{#snippet child({ props })}
				<Button variant="outline" {...props}>Cerrar</Button>
			{/snippet}
		</DialogPrimitive.Close>
	{/if}
</div>
