<script lang="ts">
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Label } from '#lib/components/ui/label';
	import { Textarea } from '#lib/components/ui/textarea';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import PhotoViewer from '#lib/components/evidence/photo-viewer.svelte';
	import type { PageProps } from './$types';
	import { ADDITIONAL_GROUP_LABEL, NO_REQUIREMENT_GROUP_LABEL } from '#lib/types';

	type ActionData = {
		success?: string;
		message?: string;
		rejectErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let showApprove = $state(false);
	let showReject = $state(false);

	function formatDate(value: Date | string): string {
		return new Date(value).toLocaleString();
	}

	const hasRequirementGroups = $derived(
		data.detail.photos.some((photo) => photo.requirementNameSnapshot !== null)
	);

	const groups = $derived(
		[...new Set(data.detail.photos.map((photo) => photo.groupSortOrder))]
			.sort((a, b) => a - b)
			.map((order) => {
				const photos = data.detail.photos
					.filter((photo) => photo.groupSortOrder === order)
					.sort((a, b) => a.photoSortOrder - b.photoSortOrder);
				return {
					order,
					name:
						photos[0]?.requirementNameSnapshot ??
						(hasRequirementGroups ? ADDITIONAL_GROUP_LABEL : NO_REQUIREMENT_GROUP_LABEL),
					photos
				};
			})
	);

	let viewerOpen = $state(false);
	let viewerIndex = $state(0);
	const viewerPhotos = $derived(
		groups.flatMap((group) =>
			group.photos.map((photo, index) => ({
				id: photo.photoId,
				label: `${group.name} · Foto ${index + 1} de ${group.photos.length}`
			}))
		)
	);

	function openViewer(photoId: string) {
		const index = viewerPhotos.findIndex((photo) => photo.id === photoId);
		if (index < 0) return;
		viewerIndex = index;
		viewerOpen = true;
	}
</script>

<svelte:head>
	<title>Entrega #{data.detail.submission.sequenceNo} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader>
		<AppBreadcrumbs
			items={[
				{
					label: data.detail.context.serviceName,
					href: `/services/${data.detail.context.serviceId}`
				},
				{ label: `Entrega #${data.detail.submission.sequenceNo}` }
			]}
		/>
		<div class="space-y-1">
			<p class="text-sm text-muted-foreground">
				{data.detail.context.serviceName} · {data.detail.submission.workNameSnapshot ?? ''}
				{#if data.detail.submission.targetNameSnapshot && data.detail.submission.targetNameSnapshot !== data.detail.submission.workNameSnapshot}
					· {data.detail.submission.targetNameSnapshot}
				{/if}
			</p>
			<p class="text-sm text-muted-foreground">
				Enviada por {data.detail.submission.submittedByName ?? 'Autor desconocido'} el
				{formatDate(data.detail.submission.submittedAt)}
			</p>
		</div>
		{#snippet actions()}
			{#if data.detail.review}
				{#if data.detail.review.decision === 'approved'}
					<StatusBadge status="approved" label="Aprobada" />
				{:else}
					<StatusBadge status="rejected" label="Rechazada" />
				{/if}
			{:else}
				<StatusBadge status="in_review" label="Pendiente de revisión" />
			{/if}
			{#if data.canExport}
				<Button
					href={`/api/submissions/${data.detail.submission.id}/export.zip`}
					variant="outline"
					size="sm"
					class="w-full sm:w-auto">Descargar ZIP</Button
				>
			{/if}
		{/snippet}
	</PageHeader>

	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
		<div class="space-y-6">
			{#each groups as group (group.order)}
				<Card.Root>
					<Card.Header class="flex items-center justify-between">
						<Card.Title class="text-base">{group.name}</Card.Title>
						<span class="tnum text-sm text-muted-foreground">{group.photos.length} foto(s)</span>
					</Card.Header>
					<Card.Content>
						<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
							{#each group.photos as photo, index (photo.id)}
								<li class="space-y-1">
									<button
										type="button"
										class="block w-full"
										onclick={() => openViewer(photo.photoId)}
										aria-label={`Abrir foto ${index + 1} de ${group.photos.length}`}
									>
										<img
											src={`/api/photos/${photo.photoId}/thumbnail`}
											alt={`Foto ${index + 1} de ${group.photos.length}`}
											loading="lazy"
											class="aspect-[4/3] w-full rounded-md border border-input object-cover"
										/>
									</button>
									{#if photo.uploadedByName}
										<p class="truncate text-xs text-muted-foreground">{photo.uploadedByName}</p>
									{/if}
								</li>
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>

		<div class="mt-6 space-y-6 lg:mt-0">
			{#if data.detail.review}
				<Card.Root>
					<Card.Header><Card.Title class="text-base">Revisión</Card.Title></Card.Header>
					<Card.Content class="space-y-1 text-sm">
						<p>
							{data.detail.review.decision === 'approved' ? 'Aprobada' : 'Rechazada'} por
							{data.detail.review.reviewerName ?? 'Revisor'} el
							{formatDate(data.detail.review.reviewedAt)}.
						</p>
						{#if data.detail.review.reason}
							<p>Motivo: {data.detail.review.reason}</p>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}

			{#if data.canReview}
				<Card.Root>
					<Card.Header><Card.Title class="text-base">Decisión</Card.Title></Card.Header>
					<Card.Content class="flex flex-wrap gap-3">
						<Button onclick={() => (showApprove = true)}>Aprobar entrega</Button>
						<Button variant="destructive" onclick={() => (showReject = true)}
							>Rechazar entrega</Button
						>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>
</div>

<PhotoViewer photos={viewerPhotos} startIndex={viewerIndex} bind:open={viewerOpen} />

<AlertDialog.Root bind:open={showApprove}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Confirmar aprobación</AlertDialog.Title>
			<AlertDialog.Description>
				¿Confirmas que esta entrega cumple con lo solicitado? Una vez aprobada, la evidencia quedará
				bloqueada para todos los técnicos.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<form method="POST" action="?/approve">
				<Button type="submit">Confirmar aprobación</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={showReject}>
	<AlertDialog.Content>
		<form method="POST" action="?/reject" class="space-y-4">
			<AlertDialog.Header>
				<AlertDialog.Title>Confirmar rechazo</AlertDialog.Title>
				<AlertDialog.Description>Describe qué deben corregir los técnicos.</AlertDialog.Description>
			</AlertDialog.Header>
			<div class="space-y-1">
				<Label for="reason">Motivo del rechazo (obligatorio)</Label>
				<Textarea
					id="reason"
					name="reason"
					rows={3}
					required
					placeholder="Describe qué deben corregir los técnicos."
					aria-invalid={action?.rejectErrors?.reason ? true : undefined}
					aria-describedby={action?.rejectErrors?.reason ? 'reason-error' : undefined}
				/>
				{#if action?.rejectErrors?.reason}
					<p id="reason-error" class="text-sm text-destructive">{action.rejectErrors.reason}</p>
				{/if}
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
				<Button type="submit" variant="destructive">Confirmar rechazo</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
