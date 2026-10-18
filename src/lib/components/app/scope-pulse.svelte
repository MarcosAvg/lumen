<script lang="ts">
	import { resolve } from '$app/paths';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Chip from '#lib/components/app/chip.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import MiniMeter from '#lib/components/app/mini-meter.svelte';
	import * as Card from '#lib/components/ui/card';
	import { formatRelativeAge } from '#lib/utils';

	type Item = {
		id: string;
		name: string;
		serviceCount?: number;
		totalTargets: number;
		approvedTargets: number;
		pendingReviews: number;
		rejectedTargets: number;
		lastActivity: Date | null;
	};

	let {
		kind,
		items,
		title,
		description
	}: {
		kind: 'contract' | 'service';
		items: Item[];
		title: string;
		description: string;
	} = $props();

	const allHref = $derived(
		kind === 'contract' ? resolve('/(app)/contracts') : resolve('/(app)/services')
	);
</script>

<Card.Root>
	<Card.Content class="space-y-3">
		<div class="flex items-start justify-between gap-3">
			<div class="space-y-0.5">
				<h2 class="text-sm font-semibold">{title}</h2>
				<p class="text-xs text-muted-foreground">{description}</p>
			</div>
			<a href={allHref} class="text-xs font-medium text-primary hover:underline">Ver todos</a>
		</div>

		{#if items.length === 0}
			<EmptyState
				Icon={kind === 'contract' ? ShieldCheck : Building2}
				tone="approved"
				title={kind === 'contract' ? 'Sin contratos activos' : 'Sin servicios asignados'}
				description={kind === 'contract'
					? 'Crea un contrato para empezar a agrupar servicios.'
					: 'Cuando te asignen un servicio, aparecerá aquí.'}
			/>
		{:else}
			<ul class="divide-y overflow-hidden rounded-lg border border-border">
				{#each items as item (item.id)}
					{@const href =
						kind === 'contract'
							? resolve('/(app)/contracts/[contractId]', { contractId: item.id })
							: resolve('/(app)/services/[serviceId]', { serviceId: item.id })}
					<li class="relative p-3 transition-colors hover:bg-muted/30">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 space-y-1">
								<a
									class="block truncate font-medium text-foreground after:absolute after:inset-0"
									{href}
								>
									{item.name}
								</a>
								<p class="text-xs text-muted-foreground">
									{#if kind === 'contract'}
										{item.serviceCount ?? 0} servicio(s) · {item.totalTargets} objetivo(s)
									{:else}
										{item.totalTargets} objetivo(s)
									{/if}
									· {item.lastActivity ? formatRelativeAge(item.lastActivity) : 'sin actividad'}
								</p>
							</div>
							<div class="shrink-0 pt-0.5">
								<MiniMeter value={item.approvedTargets} total={item.totalTargets} />
							</div>
						</div>
						{#if item.pendingReviews > 0 || item.rejectedTargets > 0}
							<div class="relative z-10 mt-2 flex flex-wrap gap-1.5">
								{#if item.pendingReviews > 0}
									<Chip tone="pending">{item.pendingReviews} en revisión</Chip>
								{/if}
								{#if item.rejectedTargets > 0}
									<Chip tone="rejected">{item.rejectedTargets} rechazado(s)</Chip>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
