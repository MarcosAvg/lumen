<script lang="ts">
	/**
	 * Instrumento de progreso: barra medida por objetivos aprobados. Es la firma
	 * visual de la cabecera; el color indica completado. Sin texto redundante:
	 * barra + `X/Y` + `%` (el detalle va en `aria-label`/`title`).
	 */
	let {
		approved,
		total,
		percent,
		completed = false
	}: {
		approved: number;
		total: number;
		percent: number;
		completed?: boolean;
	} = $props();

	const description = $derived(`${approved} de ${total} objetivos aprobados (${percent}%)`);
</script>

<div class="space-y-1.5" title={description} aria-label={description}>
	<div class="flex items-baseline justify-between gap-3">
		<span class="tnum text-sm font-medium text-foreground">
			{approved}<span class="text-muted-foreground">/{total}</span>
		</span>
		<span class="tnum text-xs text-muted-foreground">{percent}%</span>
	</div>
	<div class="h-2 overflow-hidden rounded-full bg-muted">
		<div
			class="h-full rounded-full transition-[width] duration-300 {completed
				? 'bg-state-approved'
				: 'bg-primary'}"
			style="width: {Math.max(0, Math.min(100, percent))}%"
		></div>
	</div>
</div>
