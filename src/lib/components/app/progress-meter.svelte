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

<div
	class="space-y-2"
	title={description}
	aria-label={description}
	role="progressbar"
	aria-valuemin="0"
	aria-valuemax={total}
	aria-valuenow={approved}
>
	<div class="flex items-end justify-between gap-3">
		<span class="tnum text-lg leading-none font-semibold tracking-tight text-foreground">
			{approved}<span class="text-sm font-medium text-muted-foreground">/{total}</span>
		</span>
		<span class="tnum text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
			>{percent}%</span
		>
	</div>
	<div class="relative h-2 overflow-hidden rounded-[3px] bg-muted ring-1 ring-border/60 ring-inset">
		<div
			class="h-full rounded-[3px] transition-[width] duration-300 {completed
				? 'bg-teal'
				: 'bg-primary'}"
			style="width: {Math.max(0, Math.min(100, percent))}%"
		></div>
		<span class="pointer-events-none absolute inset-y-0 left-1/4 w-px bg-background/80"></span>
		<span class="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-background/80"></span>
		<span class="pointer-events-none absolute inset-y-0 left-3/4 w-px bg-background/80"></span>
	</div>
</div>
