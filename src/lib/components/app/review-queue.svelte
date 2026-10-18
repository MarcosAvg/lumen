<script lang="ts">
	import { resolve } from '$app/paths';
	import Clock3 from '@lucide/svelte/icons/clock-3';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import * as Card from '#lib/components/ui/card';
	import { formatRelativeAge } from '#lib/utils';

	type Item = {
		submissionId: string;
		sequenceNo: number;
		submittedAt: Date;
		submittedByName: string | null;
		label: string;
		workName: string;
		serviceName: string;
	};

	let { items, total }: { items: Item[]; total: number } = $props();

	const STALE_MS = 24 * 60 * 60 * 1000;
</script>

<Card.Root>
	<Card.Content class="space-y-3">
		<div class="flex items-start justify-between gap-3">
			<div class="space-y-0.5">
				<h2 class="text-sm font-semibold">Cola de revisión</h2>
				<p class="text-xs text-muted-foreground">
					{total > 0 ? `${total} entrega(s), las más antiguas primero` : 'Sin entregas pendientes'}
				</p>
			</div>
			{#if total > 0}
				<a
					href={resolve('/(app)/reviews')}
					class="text-xs font-medium text-primary hover:underline"
				>
					Ver todas
				</a>
			{/if}
		</div>

		{#if items.length === 0}
			<EmptyState
				Icon={ClipboardCheck}
				tone="approved"
				title="Sin revisiones pendientes"
				description="Cuando los técnicos envíen evidencia, aparecerá aquí."
			/>
		{:else}
			<ul class="divide-y overflow-hidden rounded-lg border border-border">
				{#each items as item (item.submissionId)}
					{@const age = Date.now() - new Date(item.submittedAt).getTime()}
					<li
						class="relative flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/30"
					>
						<div class="min-w-0 space-y-0.5">
							<a
								class="block truncate font-medium text-foreground after:absolute after:inset-0"
								href={resolve('/(app)/submissions/[submissionId]', {
									submissionId: item.submissionId
								})}
							>
								{item.label}
							</a>
							<p class="truncate text-xs text-muted-foreground">
								{item.serviceName} · {item.workName} · #{item.sequenceNo} ·
								{item.submittedByName ?? 'Autor desconocido'}
							</p>
							<p
								class="flex items-center gap-1 text-[11px] {age > STALE_MS
									? 'font-medium text-destructive-ink'
									: 'text-muted-foreground'}"
							>
								<Clock3 class="size-3" aria-hidden="true" />
								{formatRelativeAge(item.submittedAt)}
								{#if age > STALE_MS}
									· fuera de objetivo
								{/if}
							</p>
						</div>
						<StatusBadge status="in_review" />
					</li>
				{/each}
			</ul>
			{#if total > items.length}
				<a
					href={resolve('/(app)/reviews')}
					class="inline-flex text-xs font-medium text-primary hover:underline"
				>
					Ver las {total} pendientes
				</a>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
