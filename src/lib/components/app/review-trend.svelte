<script lang="ts">
	import * as Card from '#lib/components/ui/card';

	type Point = { date: string; submitted: number; approved: number; rejected: number };

	let { points }: { points: Point[] } = $props();

	const totals = $derived(
		points.reduce(
			(acc, point) => ({
				submitted: acc.submitted + point.submitted,
				approved: acc.approved + point.approved,
				rejected: acc.rejected + point.rejected
			}),
			{ submitted: 0, approved: 0, rejected: 0 }
		)
	);
	const max = $derived(
		Math.max(1, ...points.map((point) => point.submitted + point.approved + point.rejected))
	);
	const hasActivity = $derived(totals.submitted + totals.approved + totals.rejected > 0);

	function label(date: string): string {
		return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(
			new Date(`${date}T00:00:00Z`)
		);
	}

	function title(point: Point): string {
		return `${label(point.date)}: ${point.submitted} enviadas, ${point.approved} aprobadas, ${point.rejected} rechazadas`;
	}
</script>

<Card.Root>
	<Card.Content class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="space-y-0.5">
				<h2 class="text-sm font-semibold">Actividad de revisión</h2>
				<p class="text-xs text-muted-foreground">Últimos 30 días</p>
			</div>
			<ul class="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
				<li class="flex items-center gap-1.5">
					<span class="size-2 rounded-full bg-primary/70" aria-hidden="true"></span>
					Enviadas <span class="tnum font-medium text-foreground">{totals.submitted}</span>
				</li>
				<li class="flex items-center gap-1.5">
					<span class="size-2 rounded-full bg-state-approved" aria-hidden="true"></span>
					Aprobadas <span class="tnum font-medium text-foreground">{totals.approved}</span>
				</li>
				<li class="flex items-center gap-1.5">
					<span class="size-2 rounded-full bg-state-rejected" aria-hidden="true"></span>
					Rechazadas <span class="tnum font-medium text-foreground">{totals.rejected}</span>
				</li>
			</ul>
		</div>

		{#if !hasActivity}
			<div
				class="flex h-28 items-center justify-center rounded-lg border border-dashed border-border bg-surface-inset text-sm text-muted-foreground"
			>
				Sin actividad en el periodo.
			</div>
		{:else}
			<div
				class="flex h-28 items-end gap-px border-b border-border pb-1"
				role="img"
				aria-label="Actividad diaria de envíos y revisiones en los últimos 30 días"
			>
				{#each points as point (point.date)}
					<div
						class="flex h-full min-w-0 flex-1 flex-col-reverse justify-start gap-px"
						title={title(point)}
					>
						{#if point.submitted > 0}
							<span
								class="w-full rounded-t-[2px] bg-primary/70"
								style="height: {(point.submitted / max) * 100}%"
							></span>
						{/if}
						{#if point.approved > 0}
							<span class="w-full bg-state-approved" style="height: {(point.approved / max) * 100}%"
							></span>
						{/if}
						{#if point.rejected > 0}
							<span
								class="w-full rounded-b-[2px] bg-state-rejected"
								style="height: {(point.rejected / max) * 100}%"
							></span>
						{/if}
					</div>
				{/each}
			</div>
			<div class="flex justify-between text-[10px] text-muted-foreground">
				<span>{label(points[0].date)}</span>
				<span>{label(points.at(-1)!.date)}</span>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
