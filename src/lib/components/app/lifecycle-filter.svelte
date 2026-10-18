<script lang="ts" module>
	export interface LifecycleFilterOption<Value extends string> {
		value: Value;
		label: string;
		count: number;
	}
</script>

<script lang="ts" generics="T extends string">
	let {
		options,
		value = $bindable(),
		label = 'Filtrar por estado'
	}: {
		options: LifecycleFilterOption<T>[];
		value: T;
		label?: string;
	} = $props();
</script>

<div role="group" aria-label={label} class="flex flex-wrap gap-1.5">
	{#each options as option (option.value)}
		<button
			type="button"
			class={[
				'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ring-inset',
				value === option.value
					? 'bg-foreground text-background ring-foreground'
					: 'bg-card text-muted-foreground ring-border hover:bg-muted hover:text-foreground'
			]}
			aria-pressed={value === option.value}
			onclick={() => (value = option.value)}
		>
			{option.label}
			<span class="tnum opacity-70">{option.count}</span>
		</button>
	{/each}
</div>
