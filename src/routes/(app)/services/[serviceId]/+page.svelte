<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Tabs from '#lib/components/ui/tabs';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import CatalogItemPicker from '#lib/components/catalog/catalog-item-picker.svelte';
	import ElementsEditor from '#lib/components/catalog/elements-editor.svelte';
	import GenerateStructureDialog from '#lib/components/catalog/generate-structure-dialog.svelte';
	import type { CatalogGroup, ElementDraft } from '#lib/components/catalog/types';
	import type { PageProps } from './$types';

	type ActionData = {
		success?: string;
		message?: string;
		workErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let workOpen = $state(false);
	let generateOpen = $state(false);
	let workSource = $state<'catalog' | 'custom'>('catalog');
	let workMode = $state<'direct' | 'divided'>('direct');
	let workElements = $state<ElementDraft[]>([]);
	let sourceSeeded = false;
	$effect(() => {
		// Origen por defecto: catálogo si hay alguno, si no nombre propio.
		if (!sourceSeeded) {
			workSource = catalogsForPicker.length > 0 ? 'catalog' : 'custom';
			sourceSeeded = true;
		}
		if (action?.success) {
			workOpen = false;
			workSource = catalogsForPicker.length > 0 ? 'catalog' : 'custom';
			workMode = 'direct';
			workElements = [];
		}
	});

	const elementsJson = $derived(JSON.stringify(workElements));

	const accessLabel = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	} as const;
	const participantLabel = { technician: 'Técnico', supervisor: 'Supervisor' } as const;
	const statusLabel = {
		pending: 'Pendiente',
		in_progress: 'En progreso',
		in_review: 'En revisión',
		rejected: 'Rechazado',
		approved: 'Aprobado'
	} as const;

	// Catálogos ofrecidos en los pickers: generales (ni edificios ni requisitos).
	const catalogsForPicker = $derived<CatalogGroup[]>(
		data.catalogs
			.filter((catalog) => catalog.purpose !== 'buildings' && catalog.purpose !== 'requirements')
			.map((catalog) => ({
				id: catalog.id,
				name: catalog.name,
				items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
			}))
	);
	// Edificios: solo catálogos marcados como tales (si no hay ninguno, todos).
	const buildingCatalogs = $derived.by<CatalogGroup[]>(() => {
		const buildings = data.catalogs.filter((catalog) => catalog.purpose === 'buildings');
		// Respaldo: cualquier catálogo que no sea de requisitos.
		const source =
			buildings.length > 0
				? buildings
				: data.catalogs.filter((catalog) => catalog.purpose !== 'requirements');
		return source.map((catalog) => ({
			id: catalog.id,
			name: catalog.name,
			items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
		}));
	});

	let buildingItemId = $state('');
	let buildingSeeded = false;
	$effect(() => {
		if (!buildingSeeded) {
			buildingItemId = data.service.buildingCatalogItemId ?? '';
			buildingSeeded = true;
		}
	});
</script>

<svelte:head>
	<title>{data.service.name} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<AppBreadcrumbs
			items={[{ label: 'Inicio', href: resolve('/(app)/dashboard') }, { label: data.service.name }]}
		/>
		<h1 class="mt-2 text-2xl font-semibold tracking-tight">{data.service.name}</h1>
		{#if data.service.description}
			<p class="text-sm text-muted-foreground">{data.service.description}</p>
		{/if}
		<div class="mt-2 flex flex-wrap items-center gap-2">
			{#if data.service.buildingName}
				<Badge variant="secondary">Edificio: {data.service.buildingName}</Badge>
			{/if}
			<Badge variant="secondary">Tu acceso: {accessLabel[data.access]}</Badge>
			<Badge variant={data.progress.completed ? 'default' : 'outline'}>
				{data.progress.completed ? 'Completado' : 'Incompleto'} · {data.progress
					.approvedTargets}/{data.progress.totalTargets} ({data.progress.percent}%)
			</Badge>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Button href={`/api/services/${data.service.id}/export.zip`} variant="outline" size="sm">
			Exportar evidencias aprobadas (ZIP)
		</Button>
		<span class="text-xs text-muted-foreground">
			Solo incluye entregas aprobadas; el ZIP lleva un resumen de las pendientes omitidas.
		</span>
	</div>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	{#if data.isAdmin}
		<Card.Root>
			<Card.Header><Card.Title class="text-base">Datos del servicio</Card.Title></Card.Header>
			<Card.Content>
				<form method="POST" action="?/updateService" class="grid gap-4 sm:grid-cols-3">
					<input type="hidden" name="serviceId" value={data.service.id} />
					<div class="space-y-2">
						<Label for="svc-name">Nombre</Label>
						<Input id="svc-name" name="name" value={data.service.name} required />
					</div>
					<div class="space-y-2">
						<Label for="svc-desc">Descripción</Label>
						<Input id="svc-desc" name="description" value={data.service.description ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="svc-building">Edificio</Label>
						<CatalogItemPicker
							name="buildingItemId"
							catalogs={buildingCatalogs}
							bind:value={buildingItemId}
							itemPlaceholder="Sin edificio"
						/>
					</div>
					<div class="sm:col-span-3">
						<Button type="submit" variant="outline" size="sm">Guardar cambios</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header class="flex flex-wrap items-center justify-between gap-2">
			<Card.Title class="text-base">Trabajos</Card.Title>
			{#if data.isAdmin}
				<div class="flex flex-wrap gap-2">
					<Button size="sm" onclick={() => (workOpen = true)}>Nuevo trabajo</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={catalogsForPicker.length === 0}
						onclick={() => (generateOpen = true)}>Generar en lote</Button
					>
				</div>
			{/if}
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.works.length === 0}
				<p class="text-sm text-muted-foreground">
					Sin trabajos. Un servicio sin trabajos nunca se considera completado.
				</p>
			{:else}
				<ul class="divide-y">
					{#each data.works as work (work.id)}
						<li class="flex flex-wrap items-center justify-between gap-2 py-3">
							<div>
								<p class="flex items-center gap-2 font-medium">
									{work.name}
									<Badge variant="secondary"
										>{work.mode === 'direct' ? 'Directo' : 'Dividido'}</Badge
									>
									{#if work.approved}
										<Badge>Aprobado</Badge>
									{:else if work.mode === 'divided' && work.elementCount === 0}
										<Badge variant="destructive">Sin elementos</Badge>
									{/if}
								</p>
								{#if work.mode === 'divided'}
									<p class="text-sm text-muted-foreground">
										{work.approvedElements}/{work.elementCount} elemento(s) aprobado(s)
									</p>
								{:else if work.workStatus}
									<p class="text-sm text-muted-foreground">
										Estado: {statusLabel[work.workStatus]}
									</p>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<Button
									href={resolve('/(app)/works/[workId]', { workId: work.id })}
									variant="outline"
									size="sm">Abrir</Button
								>
								{#if data.isAdmin}
									<DestructiveDelete
										label="Eliminar"
										endpoint={`/api/works/${work.id}`}
										itemName={work.name}
										description="Se eliminarán sus elementos, entregas y fotos."
									/>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Participantes</Card.Title></Card.Header>
		<Card.Content>
			{#if data.participants.length === 0}
				<p class="text-sm text-muted-foreground">Sin participantes asignados.</p>
			{:else}
				<ul class="divide-y">
					{#each data.participants as participant (participant.userId + participant.assignmentRole)}
						<li class="flex items-center justify-between gap-3 py-2 text-sm">
							<span>{participant.displayName}</span>
							<Badge variant="secondary">{participantLabel[participant.assignmentRole]}</Badge>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if data.isAdmin}
		<Card.Root>
			<Card.Header><Card.Title class="text-base">Zona de peligro</Card.Title></Card.Header>
			<Card.Content class="space-y-2">
				<p class="text-sm text-muted-foreground">
					Eliminar el servicio borra de forma permanente sus trabajos, elementos, evidencia,
					entregas y asignaciones.
				</p>
				<DestructiveDelete
					label="Eliminar servicio"
					endpoint={`/api/services/${data.service.id}`}
					itemName={data.service.name}
					onDeleted={() => {
						void goto(resolve('/(app)/dashboard'));
					}}
				/>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.isAdmin}
		<Dialog.Root bind:open={workOpen}>
			<Dialog.Content>
				<form method="POST" action="?/createWork" class="space-y-4">
					<input type="hidden" name="serviceId" value={data.service.id} />
					<Dialog.Header>
						<Dialog.Title>Nuevo trabajo</Dialog.Title>
						<Dialog.Description>
							Los trabajos directos tienen su propia evidencia; los divididos se componen de
							elementos.
						</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-1">
						<Label for="work-mode">Modo</Label>
						<select
							id="work-mode"
							name="mode"
							bind:value={workMode}
							class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						>
							<option value="direct">Directo</option>
							<option value="divided">Dividido</option>
						</select>
					</div>
					<div class="space-y-2">
						<p class="text-xs text-muted-foreground">
							Elige un ítem del catálogo o escribe un nombre propio.
						</p>
						<Tabs.Root bind:value={workSource}>
							<Tabs.List class="grid w-full grid-cols-2">
								<Tabs.Trigger value="catalog">Desde catálogo</Tabs.Trigger>
								<Tabs.Trigger value="custom">Nombre propio</Tabs.Trigger>
							</Tabs.List>
						</Tabs.Root>
						{#if workSource === 'catalog'}
							<div class="space-y-1 pt-2">
								<Label for="work-catalog">Ítem del catálogo</Label>
								<CatalogItemPicker
									name="catalogItemId"
									catalogs={catalogsForPicker}
									itemPlaceholder="Elige ítem…"
								/>
							</div>
						{:else}
							<div class="space-y-1 pt-2">
								<Label for="work-name">Nombre propio</Label>
								<Input id="work-name" name="name" required />
								{#if action?.workErrors?.name}
									<p class="text-sm text-destructive">{action.workErrors.name}</p>
								{/if}
							</div>
						{/if}
					</div>
					{#if workMode === 'divided'}
						<div class="space-y-3 rounded-lg border p-3">
							<Label>Elementos</Label>
							<ElementsEditor catalogs={catalogsForPicker} bind:value={workElements} />
						</div>
					{/if}
					<input type="hidden" name="elements" value={elementsJson} />
					<Dialog.Footer>
						<Dialog.Close>Cancelar</Dialog.Close>
						<Button type="submit">Crear trabajo</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>

		<GenerateStructureDialog
			serviceId={data.service.id}
			catalogs={catalogsForPicker}
			bind:open={generateOpen}
		/>
	{/if}
</div>
