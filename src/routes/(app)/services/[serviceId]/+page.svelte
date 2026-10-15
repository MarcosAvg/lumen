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
	import RequirementsEditor from '#lib/components/catalog/requirements-editor.svelte';
	import ProgressMeter from '#lib/components/app/progress-meter.svelte';
	import MiniMeter from '#lib/components/app/mini-meter.svelte';
	import Chip from '#lib/components/app/chip.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import type { CatalogGroup, ElementDraft, RequirementDraft } from '#lib/components/catalog/types';
	import type { PageProps } from './$types';
	import { NativeSelect } from '#lib/components/ui/native-select';

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
	let workRequirements = $state<RequirementDraft[]>([]);
	let workRequirementsRequired = $state(true);
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
			workRequirements = [];
			workRequirementsRequired = true;
		}
	});

	const elementsJson = $derived(JSON.stringify(workElements));
	const requirementsJson = $derived(JSON.stringify(workRequirements));

	// Pantalla de asignar/revocar participantes (solo admin).
	const assignmentHref = $derived(
		resolve('/(app)/admin/services/[serviceId]', { serviceId: data.service.id })
	);

	const accessLabel = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	} as const;
	const participantLabel = { technician: 'Técnico', supervisor: 'Supervisor' } as const;

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
	// Requisitos: solo catálogos marcados como tales.
	const requirementCatalogs = $derived<CatalogGroup[]>(
		data.catalogs
			.filter((catalog) => catalog.purpose === 'requirements')
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
	<div class="space-y-3 border-b pb-4 lg:pb-5">
		<AppBreadcrumbs
			items={[{ label: 'Inicio', href: resolve('/(app)/dashboard') }, { label: data.service.name }]}
		/>
		<div class="flex flex-wrap items-start gap-3">
			{#if data.service.description}
				<p class="line-clamp-2 max-w-prose text-sm text-muted-foreground">
					{data.service.description}
				</p>
			{/if}
			<div class="ml-auto flex shrink-0 flex-wrap items-center gap-2">
				{#if data.isAdmin}
					<Button href={assignmentHref} variant="outline" size="sm">Gestionar asignaciones</Button>
				{/if}
				{#if data.access !== 'technician'}
					<Button href={`/api/services/${data.service.id}/export.zip`} variant="outline" size="sm"
						>Exportar ZIP</Button
					>
				{/if}
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
			{#if data.service.buildingName}
				<span class="flex items-baseline gap-1.5">
					<span class="text-muted-foreground">Edificio</span>
					<span class="font-medium text-foreground">{data.service.buildingName}</span>
				</span>
			{/if}
			<span class="flex items-baseline gap-1.5">
				<span class="text-muted-foreground">Tu acceso</span>
				<span class="font-medium text-foreground">{accessLabel[data.access]}</span>
			</span>
			<StatusBadge
				status={data.progress.completed ? 'approved' : 'in_progress'}
				label={data.progress.completed ? 'Completado' : 'Incompleto'}
			/>
		</div>
		<div class="max-w-md">
			<ProgressMeter
				approved={data.progress.approvedTargets}
				total={data.progress.totalTargets}
				percent={data.progress.percent}
				completed={data.progress.completed}
			/>
		</div>
	</div>

	{#if action?.success}
		<Alert role="status">
			<AlertDescription>{action.success}</AlertDescription>
		</Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
		<div class="space-y-6">
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
						<ul class="divide-y overflow-hidden rounded-lg border">
							{#each data.works as work (work.id)}
								<li
									class="relative flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-muted/50 active:bg-muted/70"
								>
									<div class="min-w-0">
										<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
										<a
											class="block min-w-0 truncate font-medium underline-offset-4 after:absolute after:inset-0 hover:underline"
											href={resolve('/(app)/works/[workId]', { workId: work.id })}
										>
											{work.name}
										</a>
										{#if work.mode === 'divided'}
											<div class="mt-1">
												<MiniMeter value={work.approvedElements} total={work.elementCount} />
											</div>
										{/if}
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<Chip tone="neutral">{work.mode === 'direct' ? 'Directo' : 'Dividido'}</Chip>
										{#if work.approved}
											<Chip tone="approved">Aprobado</Chip>
										{:else if work.mode === 'divided' && work.elementCount === 0}
											<Chip tone="rejected">Sin elementos</Chip>
										{:else if work.mode === 'direct' && work.workStatus}
											<StatusBadge status={work.workStatus} />
										{/if}
										{#if data.isAdmin}
											<div class="relative z-10">
												<DestructiveDelete
													label="Eliminar"
													endpoint={`/api/works/${work.id}`}
													itemName={work.name}
													description="Se eliminarán sus elementos, entregas y fotos."
												/>
											</div>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>

		<div class="mt-6 space-y-6 lg:mt-0">
			{#if data.isAdmin}
				<Card.Root>
					<Card.Header><Card.Title class="text-base">Datos del servicio</Card.Title></Card.Header>
					<Card.Content>
						<form method="POST" action="?/updateService" class="grid gap-4">
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
							<div>
								<Button type="submit" variant="outline" size="sm">Guardar cambios</Button>
							</div>
						</form>
					</Card.Content>
				</Card.Root>
			{/if}

			<Card.Root>
				<Card.Header class="flex flex-wrap items-center justify-between gap-2">
					<Card.Title class="text-base">Participantes</Card.Title>
					{#if data.isAdmin}
						<Button href={assignmentHref} variant="outline" size="sm">Asignar</Button>
					{/if}
				</Card.Header>
				<Card.Content>
					{#if data.participants.length === 0}
						<p class="text-sm text-muted-foreground">
							Sin participantes asignados.{#if data.isAdmin}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a class="underline underline-offset-4" href={assignmentHref}
									>Asignar participantes</a
								>.{/if}
						</p>
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
		</div>
	</div>

	{#if data.isAdmin}
		<Dialog.Root bind:open={workOpen}>
			<Dialog.Content class="max-h-[85vh] overflow-y-auto">
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
						<NativeSelect id="work-mode" name="mode" bind:value={workMode}>
							<option value="direct">Directo</option>
							<option value="divided">Dividido</option>
						</NativeSelect>
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
								<Input
									id="work-name"
									name="name"
									required
									aria-invalid={action?.workErrors?.name ? true : undefined}
									aria-describedby={action?.workErrors?.name ? 'work-name-error' : undefined}
								/>
								{#if action?.workErrors?.name}
									<p id="work-name-error" class="text-sm text-destructive">
										{action.workErrors.name}
									</p>
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
					{#if requirementCatalogs.length > 0}
						<div class="space-y-3 rounded-lg border p-3">
							<Label>Requisitos</Label>
							<p class="text-xs text-muted-foreground">
								{#if workMode === 'divided'}
									Se aplicarán a cada elemento creado.
								{:else}
									Se aplicarán al trabajo.
								{/if}
							</p>
							<RequirementsEditor
								catalogs={requirementCatalogs}
								bind:value={workRequirements}
								bind:required={workRequirementsRequired}
							/>
						</div>
					{/if}
					<input type="hidden" name="elements" value={elementsJson} />
					<input type="hidden" name="requirements" value={requirementsJson} />
					<input
						type="hidden"
						name="requirementIsRequired"
						value={workRequirementsRequired ? 'true' : 'false'}
					/>
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
			{requirementCatalogs}
			bind:open={generateOpen}
		/>
	{/if}
</div>
