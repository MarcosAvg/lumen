<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import ConvertWorkMode from '#lib/components/convert-work-mode.svelte';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import EvidenceCapture from '#lib/components/evidence/evidence-capture.svelte';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import ElementsEditor from '#lib/components/catalog/elements-editor.svelte';
	import type { CatalogGroup, ElementDraft } from '#lib/components/catalog/types';
	import type { PageProps } from './$types';

	type ActionData = { success?: string; message?: string; elementErrors?: Record<string, string> };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let elementOpen = $state(false);
	let newElements = $state<ElementDraft[]>([]);

	const catalogsForPicker = $derived<CatalogGroup[]>(
		data.catalogs
			.filter((catalog) => catalog.purpose !== 'buildings')
			.map((catalog) => ({
				id: catalog.id,
				name: catalog.name,
				items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
			}))
	);

	const elementsJson = $derived(JSON.stringify(newElements));

	$effect(() => {
		if (action?.success) {
			elementOpen = false;
			newElements = [];
		}
	});

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
			<AppBreadcrumbs
				items={[
					{ label: 'Inicio', href: resolve('/(app)/dashboard') },
					{
						label: data.work.serviceName,
						href: resolve('/(app)/services/[serviceId]', { serviceId: data.work.serviceId })
					},
					{ label: data.work.name }
				]}
			/>
			<h1 class="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
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
			<Card.Header class="flex flex-wrap items-center justify-between gap-2">
				<Card.Title class="text-base">Elementos</Card.Title>
				{#if data.isAdmin}
					<Button size="sm" onclick={() => (elementOpen = true)}>Añadir elementos</Button>
				{/if}
			</Card.Header>
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
									<div class="mt-2">
										<DestructiveDelete
											label="Eliminar elemento"
											endpoint={`/api/elements/${element.id}`}
											itemName={element.name}
											description="Se eliminarán su evidencia, entregas y fotos."
										/>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>

		<Dialog.Root bind:open={elementOpen}>
			<Dialog.Content>
				<form method="POST" action="?/createElements" class="space-y-4">
					<input type="hidden" name="workId" value={data.work.id} />
					<input type="hidden" name="elements" value={elementsJson} />
					<Dialog.Header>
						<Dialog.Title>Añadir elementos</Dialog.Title>
						<Dialog.Description>
							Añade varios ítems de un catálogo o escribe nombres propios.
						</Dialog.Description>
					</Dialog.Header>
					<ElementsEditor catalogs={catalogsForPicker} bind:value={newElements} />
					{#if action?.elementErrors?._form}
						<p class="text-sm text-destructive">{action.elementErrors._form}</p>
					{/if}
					<Dialog.Footer>
						<Dialog.Close>Cancelar</Dialog.Close>
						<Button type="submit" disabled={newElements.length === 0}>Añadir elementos</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	{:else if data.evidence}
		<EvidenceCapture
			targetId={data.evidence.target.id}
			label={data.work.name}
			status={data.evidence.target.status}
			editable={data.editable}
			version={data.evidence.target.version}
			requirements={data.evidence.requirements}
			photos={data.evidence.photos}
			history={data.history}
			rejection={data.rejection}
			isAdmin={data.isAdmin}
		/>
	{/if}

	{#if data.isAdmin && data.conversion}
		<ConvertWorkMode
			workId={data.work.id}
			mode={data.conversion.mode}
			hasSubmissions={data.conversion.hasSubmissions}
			direct={data.conversion.direct}
			elements={data.conversion.elements}
		/>
	{/if}
</div>
