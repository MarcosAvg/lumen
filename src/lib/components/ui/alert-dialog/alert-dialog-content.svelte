<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import { cn, type WithoutChild, type WithoutChildrenOrChild } from '#lib/utils.js';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import AlertDialogPortal from './alert-dialog-portal.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		size = 'default',
		portalProps,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		size?: 'default' | 'sm';
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
	} = $props();
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		data-size={size}
		class={cn(
			'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid max-h-[88vh] w-full -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl bg-popover p-5 text-popover-foreground shadow-xl ring-1 shadow-foreground/10 ring-foreground/10 duration-100 outline-none max-md:top-auto max-md:bottom-0 max-md:max-h-[92dvh] max-md:max-w-none max-md:translate-y-0 max-md:rounded-t-2xl max-md:rounded-b-none data-[size=default]:sm:max-w-[440px] data-[size=sm]:sm:max-w-[400px] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 max-md:data-closed:zoom-out-100 max-md:data-closed:slide-out-to-bottom-4',
			className
		)}
		{...restProps}
	/>
</AlertDialogPortal>
