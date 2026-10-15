<script lang="ts">
	import { cn } from '#lib/utils.js';

	/** Checkbox con etiqueta, tamaño y foco consistentes. */
	let {
		checked = $bindable(false),
		label,
		name,
		disabled = false,
		class: className
	}: {
		checked?: boolean;
		label: string;
		name?: string;
		disabled?: boolean;
		class?: string;
	} = $props();
</script>

<label class={cn('flex items-center gap-2 text-sm', className)}>
	<input
		type="checkbox"
		class="size-4 shrink-0 rounded border-input accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
		{name}
		bind:checked
		{disabled}
	/>
	{label}
</label>
