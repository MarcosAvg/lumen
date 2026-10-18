<script lang="ts">
	import * as Card from '#lib/components/ui/card';

	type Counts = {
		pending: number;
		in_progress: number;
		in_review: number;
		rejected: number;
		approved: number;
		total: number;
	};

	let { counts }: { counts: Counts } = $props();

	const segments = $derived([
		{ key: 'approved', label: 'Aprobados', value: counts.approved, color: 'bg-state-approved' },
		{ key: 'in_review', label: 'En revisión', value: counts.in_review, color: 'bg-state-pending' },
		{
			key: 'in_progress',
			label: 'En progreso',
			value: counts.in_progress,
			color: 'bg-state-attention'
		},
		{ key: 'pending', label: 'Pendientes', value: counts.pending, color: 'bg-muted-foreground/45' },
		{ key: 'rejected', label: 'Rechazados', value: counts.rejected, color: 'bg-state-rejected' }
	]);

	const summary = $derived(
		segments.map((segment) => `${segment.label}: ${segment.value}`).join(' · ')
	);
</script>

<Card.Root>
	<Card.Content class="space-y-4">
		<div class="flex items-start justify-between gap-3">
			<div class="space-y-0.5">
				<h2 class="text-sm font-semibold">Estado de los objetivos</h2>
				<p class="text-xs text-muted-foreground">Distribución actual del ámbito</p>
			</div>
			<span class="tnum text-2xl font-semibold tracking-tight">{counts.total}</span>
		</div>

		<div
			class="flex h-3 overflow-hidden rounded-full bg-muted ring-1 ring-border/60 ring-inset"
			role="img"
			aria-label={summary}
		>
			{#if counts.total > 0}
				{#each segments as segment (segment.key)}
					{#if segment.value > 0}
						<span
							class="{segment.color} h-full first:rounded-l-full last:rounded-r-full"
							style="width: {(segment.value / counts.total) * 100}%"
							title="{segment.label}: {segment.value}"
						></span>
					{/if}
				{/each}
			{/if}
		</div>

		<ul class="grid grid-cols-2 gap-x-4 gap-y-2">
			{#each segments as segment (segment.key)}
				<li class="flex items-center justify-between gap-2 text-xs">
					<span class="flex min-w-0 items-center gap-2">
						<span class="size-2 shrink-0 rounded-full {segment.color}" aria-hidden="true"></span>
						<span class="truncate text-muted-foreground">{segment.label}</span>
					</span>
					<span class="tnum font-medium">{segment.value}</span>
				</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>
