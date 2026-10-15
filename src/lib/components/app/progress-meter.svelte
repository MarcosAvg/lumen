<script lang="ts">
	/**
	 * Instrumento de progreso: barra medida por objetivos aprobados. Es la firma
	 * visual del tablero y las fichas; el color indica completado.
	 */
	let {
		approved,
		total,
		percent,
		completed = false,
		label = 'objetivos aprobados'
	}: {
		approved: number;
		total: number;
		percent: number;
		completed?: boolean;
		label?: string;
	} = $props();
</script>

<div class="space-y-1.5">
	<div class="tnum flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
		<span class="truncate">{approved} / {total} {label}</span>
		<span class="font-medium text-foreground">{percent}%</span>
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
