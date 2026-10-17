<script lang="ts" module>
	export type DialogSize = 'sm' | 'default' | 'lg' | 'xl';

	const sizeClasses: Record<DialogSize, string> = {
		sm: 'sm:max-w-[420px]',
		default: 'sm:max-w-[560px]',
		lg: 'sm:max-w-[720px]',
		xl: 'sm:max-w-[880px]'
	};
</script>

<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn, type WithoutChildrenOrChild } from '#lib/utils.js';
	import * as Dialog from './index.js';
	import DialogPortal from './dialog-portal.svelte';
	import type { Snippet } from 'svelte';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		size = 'default',
		portalProps,
		children,
		showCloseButton = true,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		size?: DialogSize;
		children: Snippet;
		showCloseButton?: boolean;
	} = $props();
</script>

<DialogPortal {...portalProps}>
	<Dialog.Overlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		data-size={size}
		class={cn(
			'fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-full max-w-[calc(100%_-_2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-2xl bg-popover p-0 text-sm text-popover-foreground shadow-xl ring-1 shadow-foreground/10 ring-foreground/10 duration-100 outline-none max-md:top-auto max-md:bottom-0 max-md:max-h-[92dvh] max-md:max-w-none max-md:translate-y-0 max-md:rounded-t-2xl max-md:rounded-b-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 max-md:data-closed:zoom-out-100 max-md:data-closed:slide-out-to-bottom-4',
			sizeClasses[size],
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close data-slot="dialog-close">
				{#snippet child({ props })}
					<Button variant="ghost" class="absolute top-3 right-3" size="icon-sm" {...props}>
						<XIcon />
						<span class="sr-only">Cerrar</span>
					</Button>
				{/snippet}
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
