<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import * as Tabs from '#lib/components/ui/tabs';
	import * as Table from '#lib/components/ui/table';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { Textarea } from '#lib/components/ui/textarea';
	import PageIntro from '#lib/components/app/page-intro.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import CatalogItemMultiPicker from '#lib/components/catalog/catalog-item-multi-picker.svelte';
	import type { PageProps } from './$types';
	import { NativeSelect } from '#lib/components/ui/native-select';
	import { SvelteMap } from 'svelte/reactivity';

	type ActionData = {
		success?: string;
		message?: string;
		createErrors?: Record<string, string>;
		typeErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let createOpen = $state(false);
	let typesOpen = $state(false);
	let newTypeOpen = $state(false);
	let editingTypeId = $state<string | null>(null);
	let deleteType = $state<{ id: string; name: string } | null>(null);
	let createTypeId = $state('');
	let createAllBuildings = $state(true);
	let createBuildingIds = $state<string[]>([]);

	const selectedType = $derived(data.types.find((type) => type.id === createTypeId) ?? null);
	const isBuildingType = $derived(selectedType?.systemRole === 'building');
	const createScopeLabel = $derived(
		isBuildingType
			? 'No aplica al tipo Edificios'
			: createAllBuildings
				? 'Todos los edificios'
				: createBuildingIds.length === 0
					? 'Sin edificios'
					: `${createBuildingIds.length} edificio(s)`
	);

	function openCreate() {
		createTypeId = '';
		createAllBuildings = true;
		createBuildingIds = [];
		createOpen = true;
	}

	$effect(() => {
		if (action?.success) createOpen = false;
	});

	$effect(() => {
		if (!typesOpen) {
			newTypeOpen = false;
			editingTypeId = null;
		}
	});

	const submitCatalog: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') createOpen = false;
		};

	const submitType: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				newTypeOpen = false;
				editingTypeId = null;
			}
		};

	let tab = $state('all');
	const counts = $derived.by(() => {
		const result = new SvelteMap<string, number>([['all', data.catalogs.length]]);
		for (const type of data.types) result.set(type.id, 0);
		for (const catalog of data.catalogs) {
			result.set(catalog.typeId, (result.get(catalog.typeId) ?? 0) + 1);
		}
		return result;
	});

	const visibleCatalogs = $derived(
		tab === 'all' ? data.catalogs : data.catalogs.filter((catalog) => catalog.typeId === tab)
	);
</script>

<svelte:head>
	<title>Catálogos · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageIntro
		description="Listas reutilizables para trabajos, elementos, requisitos y edificios. El tipo y el ámbito de edificios definen dónde aparecen."
	>
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" onclick={() => (typesOpen = true)}>Tipos de catálogo</Button>
			<Button onclick={openCreate}>Nuevo catálogo</Button>
		</div>
	</PageIntro>

	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<Dialog.Root bind:open={createOpen}>
		<Dialog.Content size="lg">
			<form
				method="POST"
				action="?/create"
				class="flex min-h-0 flex-1 flex-col"
				use:enhance={submitCatalog}
			>
				<Dialog.Header>
					<Dialog.Title>Nuevo catálogo</Dialog.Title>
					<Dialog.Description>
						Crea una lista reutilizable y define dónde debe aparecer.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Context
					items={[
						{ label: 'Tipo', value: selectedType?.name ?? 'Sin seleccionar' },
						{ label: 'Ámbito', value: createScopeLabel, strong: true }
					]}
				/>
				<Dialog.Body class="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
					{#if action?.message}
						<Alert variant="destructive" class="lg:col-span-2"
							><AlertDescription>{action.message}</AlertDescription></Alert
						>
					{/if}
					<Dialog.Section title="Identidad">
						<div class="space-y-2">
							<Label for="name">Nombre</Label>
							<Input
								id="name"
								name="name"
								required
								aria-invalid={action?.createErrors?.name ? true : undefined}
								aria-describedby={action?.createErrors?.name ? 'name-error' : undefined}
							/>
							{#if action?.createErrors?.name}
								<p id="name-error" class="text-sm text-destructive">{action.createErrors.name}</p>
							{/if}
						</div>
						<div class="space-y-2">
							<Label for="description">Descripción (opcional)</Label>
							<Textarea id="description" name="description" rows={2} />
						</div>
					</Dialog.Section>
					<Dialog.Section
						title="Dónde aparece"
						description="El tipo filtra la búsqueda y el ámbito decide en qué servicios se ofrece."
					>
						<div class="space-y-2">
							<Label for="typeId">Tipo de catálogo</Label>
							<NativeSelect id="typeId" name="typeId" bind:value={createTypeId} required>
								<option value="" disabled>Selecciona un tipo</option>
								{#each data.types as type (type.id)}
									<option value={type.id}>{type.name}</option>
								{/each}
							</NativeSelect>
						</div>
						{#if !isBuildingType}
							<input
								type="hidden"
								name="allBuildings"
								value={createAllBuildings ? 'true' : 'false'}
							/>
							<div class="space-y-2">
								<Label>Ámbito de edificios</Label>
								<div
									class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
									role="group"
									aria-label="Ámbito de edificios"
								>
									<button
										type="button"
										aria-pressed={createAllBuildings}
										class="rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 {createAllBuildings
											? 'bg-card text-foreground shadow-sm ring-1 ring-border/70'
											: 'text-muted-foreground hover:text-foreground'}"
										onclick={() => (createAllBuildings = true)}
									>
										Todos
									</button>
									<button
										type="button"
										aria-pressed={!createAllBuildings}
										class="rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 {!createAllBuildings
											? 'bg-card text-foreground shadow-sm ring-1 ring-border/70'
											: 'text-muted-foreground hover:text-foreground'}"
										onclick={() => (createAllBuildings = false)}
									>
										Edificios concretos
									</button>
								</div>
								<p class="text-xs text-muted-foreground">
									{#if createAllBuildings}
										Disponible en todos los servicios.
									{:else}
										Solo se ofrecerá en los servicios de los edificios elegidos.
									{/if}
								</p>
							</div>
							{#if !createAllBuildings}
								<div class="space-y-2">
									<Label>Edificios donde aparece</Label>
									<CatalogItemMultiPicker
										name="buildingIds"
										catalogs={data.buildingCatalogs}
										bind:value={createBuildingIds}
										itemPlaceholder="Añadir edificios…"
									/>
								</div>
							{/if}
						{:else}
							<input type="hidden" name="allBuildings" value="true" />
							<p
								class="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground"
							>
								El tipo Edificios se usa para el campo edificio del servicio; no tiene ámbito de
								catálogo.
							</p>
						{/if}
					</Dialog.Section>
				</Dialog.Body>
				<Dialog.Footer>
					<p class="mr-auto hidden text-xs text-muted-foreground sm:block">
						{selectedType?.name ?? 'Sin tipo'} · {createScopeLabel}
					</p>
					<Dialog.Close>Cancelar</Dialog.Close>
					<Button type="submit">Crear catálogo</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
	<form method="GET" class="flex gap-2">
		<Label for="catalog-search" class="sr-only">Buscar catálogo</Label>
		<Input
			id="catalog-search"
			name="q"
			value={data.q}
			placeholder="Buscar catálogo…"
			class="max-w-xs"
		/>
		<Button type="submit" variant="outline">Buscar</Button>
	</form>

	<Tabs.Root bind:value={tab}>
		<Tabs.List class="no-scrollbar max-w-full justify-start overflow-x-auto">
			<Tabs.Trigger value="all">Todos ({counts.get('all') ?? 0})</Tabs.Trigger>
			{#each data.types as type (type.id)}
				<Tabs.Trigger value={type.id}>{type.name} ({counts.get(type.id) ?? 0})</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</Tabs.Root>

	{#if visibleCatalogs.length === 0}
		<EmptyState
			title={data.q
				? 'Sin catálogos que coincidan.'
				: tab === 'all'
					? 'Aún no hay catálogos.'
					: 'No hay catálogos de este tipo.'}
		/>
	{:else}
		<ul class="space-y-3 md:hidden">
			{#each visibleCatalogs as catalog (catalog.id)}
				<li class="relative">
					<Card.Root class="transition-colors active:bg-muted/50">
						<Card.Content class="space-y-2">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a
										class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
										href={resolve('/(app)/admin/catalogs/[catalogId]', { catalogId: catalog.id })}
									>
										{catalog.name}
									</a>
									{#if catalog.description}
										<p class="text-sm text-muted-foreground">{catalog.description}</p>
									{/if}
								</div>
								<Badge variant="secondary" class="shrink-0">{catalog.typeName}</Badge>
							</div>
							<p class="text-xs text-muted-foreground">
								{catalog.allBuildings
									? 'Todos los edificios'
									: catalog.buildingNames.join(', ') || 'Sin edificios'}
							</p>
							<span class="tnum text-sm text-muted-foreground">{catalog.itemCount} ítem(s)</span>
						</Card.Content>
					</Card.Root>
				</li>
			{/each}
		</ul>

		<div class="hidden md:block">
			<DataTable>
				<Table.Header>
					<Table.Row>
						<Table.Head>Catálogo</Table.Head>
						<Table.Head class="hidden lg:table-cell">Tipo</Table.Head>
						<Table.Head class="hidden w-px text-right lg:table-cell">Ítems</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each visibleCatalogs as catalog (catalog.id)}
						<Table.Row class="relative">
							<Table.Cell class="whitespace-normal">
								<a
									class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
									href={resolve('/(app)/admin/catalogs/[catalogId]', { catalogId: catalog.id })}
								>
									{catalog.name}
								</a>
								{#if catalog.description}
									<p class="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
										{catalog.description}
									</p>
								{/if}
							</Table.Cell>
							<Table.Cell class="hidden lg:table-cell">
								<Badge variant="secondary">{catalog.typeName}</Badge>
								<p class="mt-1 text-xs text-muted-foreground">
									{catalog.allBuildings
										? 'Todos los edificios'
										: catalog.buildingNames.join(', ') || 'Sin edificios'}
								</p>
							</Table.Cell>
							<Table.Cell class="tnum hidden text-right text-muted-foreground lg:table-cell">
								{catalog.itemCount}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</DataTable>
		</div>
	{/if}

	<Dialog.Root bind:open={typesOpen}>
		<Dialog.Content size="xl">
			<Dialog.Header>
				<Dialog.Title>Tipos de catálogo</Dialog.Title>
				<Dialog.Description>
					Clasifican los catálogos y alimentan el filtro al crear trabajos, elementos y requisitos.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Context
				items={[
					{ label: 'Tipos', value: String(data.types.length), strong: true },
					{ label: 'Sistema', value: 'Edificios' }
				]}
			/>
			<Dialog.Body class="space-y-5">
				{#if action?.message}
					<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
				{/if}
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="space-y-1">
						<p class="text-sm font-semibold">Clasificación</p>
						<p class="text-xs leading-relaxed text-muted-foreground">
							El orden define las pestañas y los filtros de los selectores.
						</p>
					</div>
					{#if !newTypeOpen}
						<Button
							size="sm"
							onclick={() => {
								newTypeOpen = true;
								editingTypeId = null;
							}}>Nuevo tipo</Button
						>
					{/if}
				</div>

				{#if newTypeOpen}
					<form
						method="POST"
						action="?/createType"
						class="space-y-3 rounded-xl border border-border bg-muted/20 p-3"
						use:enhance={submitType}
					>
						<div class="grid gap-3 sm:grid-cols-[1fr_100px]">
							<div class="space-y-2">
								<Label for="new-type-name">Nombre</Label>
								<Input id="new-type-name" name="name" required placeholder="Ej. Sistema" />
								{#if action?.typeErrors?.name}
									<p class="text-sm text-destructive">{action.typeErrors.name}</p>
								{/if}
							</div>
							<div class="space-y-2">
								<Label for="new-type-order">Orden</Label>
								<Input id="new-type-order" name="sortOrder" type="number" min="0" value="0" />
							</div>
						</div>
						<div class="flex justify-end gap-2">
							<Button type="button" variant="ghost" size="sm" onclick={() => (newTypeOpen = false)}>
								Cancelar
							</Button>
							<Button type="submit" size="sm">Añadir</Button>
						</div>
					</form>
				{/if}

				<ul class="divide-y overflow-hidden rounded-xl border border-border bg-card">
					{#each data.types as type (type.id)}
						<li class="p-3 sm:px-4">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div class="min-w-0 space-y-1">
									<div class="flex flex-wrap items-center gap-2">
										<span class="font-medium">{type.name}</span>
										{#if type.systemRole === 'building'}
											<Badge variant="outline">Sistema</Badge>
										{/if}
									</div>
									<p class="text-xs text-muted-foreground">
										{type.catalogCount} catálogo(s)
										{#if type.systemRole === 'building'}
											· Protegido{/if}
									</p>
								</div>
								<div class="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => {
											editingTypeId = editingTypeId === type.id ? null : type.id;
											newTypeOpen = false;
										}}
									>
										{editingTypeId === type.id ? 'Cerrar' : 'Editar'}
									</Button>
									{#if type.systemRole !== 'building'}
										<Button
											type="button"
											variant="destructive"
											size="sm"
											disabled={type.catalogCount > 0}
											title={type.catalogCount > 0 ? 'Tiene catálogos asociados' : undefined}
											onclick={() => (deleteType = { id: type.id, name: type.name })}
										>
											Eliminar
										</Button>
									{/if}
								</div>
							</div>

							{#if editingTypeId === type.id}
								<form
									method="POST"
									action="?/updateType"
									class="mt-3 grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:grid-cols-[1fr_100px_auto]"
									use:enhance={submitType}
								>
									<input type="hidden" name="typeId" value={type.id} />
									<div class="space-y-1.5">
										<Label for={`type-name-${type.id}`} class="text-xs">Nombre</Label>
										<Input id={`type-name-${type.id}`} name="name" value={type.name} required />
									</div>
									<div class="space-y-1.5">
										<Label for={`type-order-${type.id}`} class="text-xs">Orden</Label>
										<Input
											id={`type-order-${type.id}`}
											name="sortOrder"
											type="number"
											min="0"
											value={String(type.sortOrder)}
										/>
									</div>
									<div class="flex items-end">
										<Button type="submit" size="sm">Guardar</Button>
									</div>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			</Dialog.Body>
			<Dialog.Footer>
				<p class="mr-auto hidden text-xs text-muted-foreground sm:block">
					Los tipos con catálogos o de sistema no se eliminan.
				</p>
				<Dialog.Close>Cerrar</Dialog.Close>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
	<AlertDialog.Root
		open={deleteType !== null}
		onOpenChange={(open) => {
			if (!open) deleteType = null;
		}}
	>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>¿Eliminar el tipo «{deleteType?.name ?? ''}»?</AlertDialog.Title>
				<AlertDialog.Description>
					Solo es posible si ningún catálogo lo utiliza.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
				<form method="POST" action="?/deleteType">
					<input type="hidden" name="typeId" value={deleteType?.id ?? ''} />
					<Button type="submit" variant="destructive">Eliminar tipo</Button>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>
