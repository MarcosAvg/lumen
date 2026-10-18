<script lang="ts">
	import { resolve } from '$app/paths';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import * as Card from '#lib/components/ui/card';
	import { formatRelativeAge } from '#lib/utils';

	type Decision = {
		reviewId: string;
		submissionId: string;
		decision: 'approved' | 'rejected';
		reason: string | null;
		reviewedAt: Date;
		reviewerName: string | null;
		serviceId: string;
		serviceName: string;
		workName: string;
		targetName: string | null;
	};

	let { decisions }: { decisions: Decision[] } = $props();
</script>

<Card.Root>
	<Card.Content class="space-y-3">
		<div class="space-y-0.5">
			<h2 class="text-sm font-semibold">Decisiones recientes</h2>
			<p class="text-xs text-muted-foreground">Últimas aprobaciones y rechazos de tu ámbito</p>
		</div>

		{#if decisions.length === 0}
			<EmptyState
				Icon={ClipboardCheck}
				tone="neutral"
				title="Sin decisiones recientes"
				description="Las aprobaciones y rechazos aparecerán aquí."
			/>
		{:else}
			<ul class="divide-y overflow-hidden rounded-lg border border-border">
				{#each decisions as decision (decision.reviewId)}
					<li class="relative space-y-1 p-3 transition-colors hover:bg-muted/30">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 space-y-0.5">
								<a
									class="block truncate font-medium text-foreground after:absolute after:inset-0"
									href={resolve('/(app)/submissions/[submissionId]', {
										submissionId: decision.submissionId
									})}
								>
									{decision.targetName ?? decision.workName}
								</a>
								<p class="truncate text-xs text-muted-foreground">{decision.serviceName}</p>
							</div>
							<StatusBadge status={decision.decision} />
						</div>
						<p class="text-[11px] text-muted-foreground">
							{decision.reviewerName ?? 'Revisor desconocido'} · {formatRelativeAge(
								decision.reviewedAt
							)}
						</p>
						{#if decision.decision === 'rejected' && decision.reason}
							<p class="line-clamp-2 text-xs text-destructive-ink">Motivo: {decision.reason}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
