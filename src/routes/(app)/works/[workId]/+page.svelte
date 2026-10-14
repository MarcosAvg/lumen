<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Tabs from '#lib/components/ui/tabs';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import ConvertWorkMode from '#lib/components/convert-work-mode.svelte';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import EvidenceCapture from '#lib/components/evidence/evidence-capture.svelte';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import CatalogItemPicker from '#lib/components/catalog/catalog-item-picker.svelte';
	import type { CatalogGroup } from '#lib/components/catalog/types';
	import type { PageProps } from './$types';

	type ActionData = { success?: string; message?: string; elementErrors?: Record<string, string> };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let elementOpen = $state(false);
	let elementSource = $state<'catalog' | 'custom'>('catalog');
	let elementCatalogItemId = $state('');
	let elementName = $state('');
	let elementSeeded = false;

	const catalogsForPicker = $derived<CatalogGroup[]>(
		data.catalogs
			.filter((catalog) => catalog.purpose !== 'buildings')
			.map((catalog) => ({
				id: catalog.id,
				name: catalog.name,
				items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
			}))
	);

	$effect(() => {
		if (!elementSeeded) {
			elementSource = catalogsForPicker.length > 0 ? 'catalog' : 'custom';
			elementSeeded = true;
		}
		if (action?.success) {
			elementOpen = false;
			elementName = '';
			elementCatalogItemId = '';
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
					<Button size="sm" onclick={() => (elementOpen = true)}>Añadir elemento</Button>
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
				<form method="POST" action="?/createElement" class="space-y-4">
					<input type="hidden" name="workId" value={data.work.id} />
					<Dialog.Header>
						<Dialog.Title>Añadir elemento</Dialog.Title>
						<Dialog.Description>
							Elige un ítem del catálogo o escribe un nombre propio.
						</Dialog.Description>
					</Dialog.Header>
					<Tabs.Root bind:value={elementSource}>
						<Tabs.List class="grid w-full grid-cols-2">
							<Tabs.Trigger value="catalog">Desde catálogo</Tabs.Trigger>
							<Tabs.Trigger value="custom">Nombre propio</Tabs.Trigger>
						</Tabs.List>
					</Tabs.Root>
					{#if elementSource === 'catalog'}
						<div class="space-y-1">
							<Label for="el-catalog">Ítem del catálogo</Label>
							<CatalogItemPicker
								name="catalogItemId"
								catalogs={catalogsForPicker}
								bind:value={elementCatalogItemId}
								itemPlaceholder="Elige ítem…"
							/>
						</div>
					{:else}
						<div class="space-y-1">
							<Label for="el-name">Nombre propio</Label>
							<Input id="el-name" name="name" bind:value={elementName} required />
							{#if action?.elementErrors?.name}
								<p class="text-sm text-destructive">{action.elementErrors.name}</p>
							{/if}
						</div>
					{/if}
					<Dialog.Footer>
						<Dialog.Close>Cancelar</Dialog.Close>
						<Button type="submit">Añadir elemento</Button>
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
