<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	/**
	 * `<select>` nativo con el aspecto y el foco de `Input`. Se usa para los
	 * formularios que envían por POST nativo, conservando el comportamiento.
	 */
	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		children,
		...restProps
	}: WithElementRef<Omit<HTMLSelectAttributes, 'value'>> & { value?: string } = $props();
</script>

<select
	bind:this={ref}
	data-slot="native-select"
	class={cn(
		'h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 max-md:h-11 dark:bg-surface-inset',
		className
	)}
	bind:value
	{...restProps}
>
	{@render children?.()}
</select>
