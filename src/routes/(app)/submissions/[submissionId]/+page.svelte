<script lang="ts">
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Label } from '#lib/components/ui/label';
	import { Textarea } from '#lib/components/ui/textarea';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
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
</script>

<svelte:head>
	<title>Entrega #{data.detail.submission.sequenceNo} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<AppBreadcrumbs
		items={[
			{
				label: data.detail.context.serviceName,
				href: `/services/${data.detail.context.serviceId}`
			},
			{ label: `Entrega #${data.detail.submission.sequenceNo}` }
		]}
	/>
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
			<Card.Content class="flex flex-wrap gap-3">
				<Button onclick={() => (showApprove = true)}>Aprobar entrega</Button>
				<Button variant="destructive" onclick={() => (showReject = true)}>Rechazar entrega</Button>

				<AlertDialog.Root bind:open={showApprove}>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Confirmar aprobación</AlertDialog.Title>
							<AlertDialog.Description>
								¿Confirmas que esta entrega cumple con lo solicitado? Una vez aprobada, la evidencia
								quedará bloqueada para todos los técnicos.
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
								<AlertDialog.Description>
									Describe qué deben corregir los técnicos.
								</AlertDialog.Description>
							</AlertDialog.Header>
							<div class="space-y-1">
								<Label for="reason">Motivo del rechazo (obligatorio)</Label>
								<Textarea
									id="reason"
									name="reason"
									rows={3}
									required
									placeholder="Describe qué deben corregir los técnicos."
								/>
								{#if action?.rejectErrors?.reason}
									<p class="text-sm text-destructive">{action.rejectErrors.reason}</p>
								{/if}
							</div>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
								<Button type="submit" variant="destructive">Confirmar rechazo</Button>
							</AlertDialog.Footer>
						</form>
					</AlertDialog.Content>
				</AlertDialog.Root>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
