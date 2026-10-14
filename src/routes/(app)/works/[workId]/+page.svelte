<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import EvidenceCapture from '#lib/components/evidence/evidence-capture.svelte';
	import type { PageProps } from './$types';

	type ActionData = { success?: string; message?: string };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	const statusLabel = {
		pending: 'Pendiente',
		in_progress: 'En progreso',
		in_review: 'En revisión',
		rejected: 'Rechazado',
		approved: 'Aprobado'
	} as const;
</script>

<svelte:head>
	<title>{data.work.name} · Trabajo · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<p class="text-sm text-muted-foreground">
				<a
					class="underline"
					href={resolve('/(app)/services/[serviceId]', { serviceId: data.work.serviceId })}
					>{data.work.serviceName}</a
				>
			</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
				{data.work.name}
				<Badge variant="secondary">{data.work.mode === 'direct' ? 'Directo' : 'Dividido'}</Badge>
			</h1>
			{#if data.work.description}
				<p class="text-sm text-muted-foreground">{data.work.description}</p>
			{/if}
		</div>
	</div>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	{#if data.isAdmin}
		<Card.Root>
			<Card.Header><Card.Title class="text-base">Editar trabajo</Card.Title></Card.Header>
			<Card.Content>
				<form method="POST" action="?/updateWork" class="grid gap-3 sm:grid-cols-3">
					<input type="hidden" name="workId" value={data.work.id} />
					<div class="space-y-1">
						<Label for="work-name">Nombre</Label>
						<Input id="work-name" name="name" value={data.work.name} required />
					</div>
					<div class="space-y-1">
						<Label for="work-desc">Descripción</Label>
						<Input id="work-desc" name="description" value={data.work.description ?? ''} />
					</div>
					<div class="flex items-end">
						<Button type="submit" variant="outline" size="sm">Guardar</Button>
					</div>
				</form>
				<p class="mt-2 text-xs text-muted-foreground">
					Renombrar un trabajo vinculado a catálogo lo desvincula y conserva el nombre propio.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.work.mode === 'divided'}
		<Card.Root>
			<Card.Header><Card.Title class="text-base">Elementos</Card.Title></Card.Header>
			<Card.Content>
				{#if data.elements.length === 0}
					<p class="text-sm text-muted-foreground">
						Sin elementos. Un trabajo dividido sin elementos nunca se considera aprobado.
					</p>
				{:else}
					<ul class="divide-y">
						{#each data.elements as element (element.id)}
							<li class="py-3">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<span class="flex items-center gap-2 text-sm">
										{element.name}
										<Badge variant="secondary">{statusLabel[element.status]}</Badge>
									</span>
									<Button
										href={resolve('/(app)/elements/[elementId]', { elementId: element.id })}
										variant="outline"
										size="sm">Abrir evidencia</Button
									>
								</div>
								{#if data.isAdmin}
									<form
										method="POST"
										action="?/updateElement"
										class="mt-2 flex flex-wrap items-end gap-2"
									>
										<input type="hidden" name="elementId" value={element.id} />
										<Input
											name="name"
											value={element.name}
											class="h-8 max-w-xs"
											aria-label="Nombre del elemento"
										/>
										<Button type="submit" variant="outline" size="sm">Renombrar</Button>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else if data.evidence}
		<EvidenceCapture
			targetId={data.evidence.target.id}
			label={data.work.name}
			status={data.evidence.target.status}
			editable={data.editable}
			version={data.evidence.target.version}
			requirements={data.evidence.requirements}
			photos={data.evidence.photos}
			isAdmin={data.isAdmin}
		/>
	{/if}
</div>
