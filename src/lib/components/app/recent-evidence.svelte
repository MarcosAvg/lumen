<script lang="ts">
	import { resolve } from '$app/paths';
	import Camera from '@lucide/svelte/icons/camera';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import type { TargetStatus } from '#lib/types';

	type RecentPhoto = {
		id: string;
		workId: string;
		elementId: string | null;
		workName: string;
		serviceName: string;
		status: TargetStatus;
		uploadedAt: Date;
		uploadedByName: string | null;
	};

	let { photos, layout = 'strip' }: { photos: RecentPhoto[]; layout?: 'strip' | 'grid' } = $props();

	const EVIDENCE_LIMIT = 6;
	const visiblePhotos = $derived(photos.slice(0, EVIDENCE_LIMIT));
	const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
</script>

<section class="min-w-0 space-y-2" aria-labelledby="recent-evidence-title">
	<div class="flex items-center justify-between gap-3">
		<h2
			id="recent-evidence-title"
			class="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
		>
			<span class="h-3 w-0.5 rounded-full bg-teal" aria-hidden="true"></span>
			Evidencia reciente
		</h2>
		{#if visiblePhotos.length > 0}
			<span class="tnum text-xs text-muted-foreground">{visiblePhotos.length} fotos</span>
		{/if}
	</div>

	{#if visiblePhotos.length === 0}
		<EmptyState
			Icon={Camera}
			title="Aún no hay fotos"
			description="La evidencia reciente aparecerá aquí cuando los técnicos suban fotografías."
		/>
	{:else}
		<ul
			class="-mx-1 no-scrollbar flex max-w-full snap-x gap-3 overflow-x-auto px-1 pb-2 md:mx-0 md:grid md:overflow-visible md:px-0 {layout ===
			'grid'
				? 'md:grid-cols-2 xl:grid-cols-3'
				: 'md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5'}"
		>
			{#each visiblePhotos as photo (photo.id)}
				{@const href = photo.elementId
					? resolve('/(app)/elements/[elementId]', { elementId: photo.elementId })
					: resolve('/(app)/works/[workId]', { workId: photo.workId })}
				<li class="w-44 shrink-0 snap-start md:w-auto md:shrink">
					<a
						{href}
						class="group/photo block overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						<div class="relative aspect-[4/3] overflow-hidden bg-muted">
							<img
								src="/api/photos/{photo.id}/thumbnail"
								alt="Evidencia de {photo.workName}"
								loading="lazy"
								decoding="async"
								class="size-full object-cover transition-transform duration-300 group-hover/photo:scale-[1.03]"
							/>
							<span class="absolute top-2 left-2 rounded-md bg-background/90 p-0.5 backdrop-blur">
								<StatusBadge status={photo.status} />
							</span>
						</div>
						<div class="space-y-1 px-3 py-2.5">
							<p class="truncate text-sm font-medium">{photo.workName}</p>
							<p class="truncate text-xs text-muted-foreground">{photo.serviceName}</p>
							<p class="truncate text-[11px] text-muted-foreground">
								{photo.uploadedByName ?? 'Autor desconocido'} · {dateFormat.format(
									new Date(photo.uploadedAt)
								)}
							</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
