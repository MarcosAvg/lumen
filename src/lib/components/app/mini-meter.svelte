<script lang="ts">
	/** Mini-medidor: barra compacta + `X/Y` (tabular), para el progreso de elementos. */
	let {
		value,
		total,
		label = 'elementos aprobados'
	}: { value: number; total: number; label?: string } = $props();

	const percent = $derived(total > 0 ? Math.round((value / total) * 100) : 0);
	const done = $derived(total > 0 && value >= total);
</script>

<span
	class="tnum inline-flex items-center gap-1.5 text-xs text-muted-foreground"
	title={`${value} de ${total} ${label}`}
>
	<span class="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
		<span
			class="block h-full rounded-full {done ? 'bg-state-approved' : 'bg-primary'}"
			style="width: {percent}%"
		></span>
	</span>
	{value}/{total}
</span>
