<script lang="ts">
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Label } from '#lib/components/ui/label';
	import type { PageProps } from './$types';

	type ActionData = {
		success?: string;
		message?: string;
		rejectErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	function formatDate(value: Date | string): string {
		return new Date(value).toLocaleString();
	}

	const groups = $derived(
		[...new Set(data.detail.photos.map((photo) => photo.groupSortOrder))]
			.sort((a, b) => a - b)
			.map((order) => {
				const photos = data.detail.photos
					.filter((photo) => photo.groupSortOrder === order)
					.sort((a, b) => a.photoSortOrder - b.photoSortOrder);
				return {
					order,
					name: photos[0]?.requirementNameSnapshot ?? 'Adicionales',
					photos
				};
			})
	);
</script>

<svelte:head>
	<title>Entrega #{data.detail.submission.sequenceNo} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">
				Entrega #{data.detail.submission.sequenceNo}
			</h1>
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
		{#if data.detail.review}
			{#if data.detail.review.decision === 'approved'}
				<Badge>Aprobada</Badge>
			{:else}
				<Badge variant="destructive">Rechazada</Badge>
			{/if}
		{:else}
			<Badge variant="secondary">Pendiente de revisión</Badge>
		{/if}
		<Button
			href={`/api/submissions/${data.detail.submission.id}/export.zip`}
			variant="outline"
			size="sm">Descargar ZIP de esta entrega</Button
		>
	</div>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

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

	{#each groups as group (group.order)}
		<Card.Root>
			<Card.Header class="flex items-center justify-between">
				<Card.Title class="text-base">{group.name}</Card.Title>
				<span class="text-sm text-muted-foreground">{group.photos.length} foto(s)</span>
			</Card.Header>
			<Card.Content>
				<ul class="flex flex-wrap gap-3">
					{#each group.photos as photo, index (photo.id)}
						<li class="w-32 space-y-1">
							<button
								type="button"
								onclick={() => window.open(`/api/photos/${photo.photoId}/content`, '_blank')}
								aria-label={`Abrir foto ${index + 1} de ${group.photos.length}`}
							>
								<img
									src={`/api/photos/${photo.photoId}/thumbnail`}
									alt={`Foto ${index + 1} de ${group.photos.length}`}
									loading="lazy"
									class="h-24 w-32 rounded-md border border-input object-cover"
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

	{#if data.canReview}
		<Card.Root>
			<Card.Header><Card.Title class="text-base">Decisión</Card.Title></Card.Header>
			<Card.Content class="space-y-4">
				<form method="POST" action="?/approve">
					<Button type="submit">Confirmar aprobación</Button>
				</form>

				<div class="border-t pt-4">
					<form method="POST" action="?/reject" class="space-y-2">
						<Label for="reason">Motivo del rechazo (obligatorio)</Label>
						<textarea
							id="reason"
							name="reason"
							rows="3"
							required
							class="w-full rounded-lg border border-input bg-background p-2 text-sm"
							placeholder="Describe qué deben corregir los técnicos."></textarea>
						{#if action?.rejectErrors?.reason}
							<p class="text-sm text-destructive">{action.rejectErrors.reason}</p>
						{/if}
						<Button type="submit" variant="destructive">Confirmar rechazo</Button>
					</form>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
