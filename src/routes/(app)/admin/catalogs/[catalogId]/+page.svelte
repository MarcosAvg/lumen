<script lang="ts">
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { Textarea } from '#lib/components/ui/textarea';
	import * as Table from '#lib/components/ui/table';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import TableActions from '#lib/components/app/table-actions.svelte';
	import RenameDialog from '#lib/components/app/rename-dialog.svelte';
	import CatalogItemMultiPicker from '#lib/components/catalog/catalog-item-multi-picker.svelte';
	import type { PageProps } from './$types';
	import { NativeSelect } from '#lib/components/ui/native-select';

	type Impact = { works: number; elements: number; services: number; requirements: number };
	type ActionData = {
		success?: string;
		message?: string;
		createErrors?: Record<string, string>;
		pendingDelete?: { itemId: string; name: string; impact: Impact };
		pendingCatalogDelete?: { catalogId: string; name: string; itemCount: number };
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	// Confirmaciones destructivas como modales: recordar lo descartado.
	let dismissedItemDeleteId = $state<string | null>(null);
	let dismissedCatalogDelete = $state(false);
	const showItemDelete = $derived(
		!!action?.pendingDelete && action.pendingDelete.itemId !== dismissedItemDeleteId
	);
	const showCatalogDelete = $derived(!!action?.pendingCatalogDelete && !dismissedCatalogDelete);

	const totalPages = $derived(Math.max(Math.ceil(data.total / data.pageSize), 1));

	let editOpen = $state(false);
	let itemOpen = $state(false);
	let editTypeId = $state('');
	let editAllBuildings = $state(true);
	let editBuildingIds = $state<string[]>([]);
	const editType = $derived(data.types.find((type) => type.id === editTypeId) ?? null);
	const editIsBuildingType = $derived(editType?.systemRole === 'building');
	const editScopeLabel = $derived(
		editIsBuildingType
			? 'No aplica al tipo Edificios'
			: editAllBuildings
				? 'Todos los edificios'
				: editBuildingIds.length === 0
					? 'Sin edificios'
					: `${editBuildingIds.length} edificio(s)`
	);

	function openEdit() {
		editTypeId = data.catalog.typeId;
		editAllBuildings = data.catalog.allBuildings;
		editBuildingIds = [...data.catalog.buildingIds];
		editOpen = true;
	}
	const submitCatalog: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') editOpen = false;
		};
	const submitItem: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') itemOpen = false;
		};

	function pageHref(page: number): string {
		const parts: string[] = [];
		if (data.q) parts.push(`q=${encodeURIComponent(data.q)}`);
		parts.push(`page=${page}`);
		return `?${parts.join('&')}`;
	}
</script>

<svelte:head>
	<title>{data.catalog.name} · Catálogo · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<AppBreadcrumbs
		items={[{ label: 'Catálogos', href: '/admin/catalogs' }, { label: data.catalog.name }]}
	/>

	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="space-y-2">
			{#if data.catalog.description}
				<p class="text-sm text-muted-foreground">{data.catalog.description}</p>
			{/if}
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">{data.catalog.typeName}</Badge>
				<span class="text-xs text-muted-foreground">
					{data.catalog.allBuildings
						? 'Todos los edificios'
						: data.catalog.buildingNames.join(', ') || 'Sin edificios'}
				</span>
			</div>
		</div>
		<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
			<Button variant="outline" size="sm" onclick={openEdit}>Editar catálogo</Button>
			<form method="POST" action="?/deleteCatalog">
				<input type="hidden" name="confirm" value="false" />
				<Button type="submit" variant="destructive" size="sm">Eliminar catálogo</Button>
			</form>
		</div>
	</div>

	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<AlertDialog.Root
		open={showCatalogDelete}
		onOpenChange={(open) => {
			if (!open) dismissedCatalogDelete = true;
		}}
	>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>
					¿Eliminar «{action?.pendingCatalogDelete?.name ?? ''}»?
				</AlertDialog.Title>
				<AlertDialog.Description>
					Sus {action?.pendingCatalogDelete?.itemCount ?? 0} ítem(s) se desvincularán y los objetos conservarán
					su nombre. No se borran evidencias.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
				<form method="POST" action="?/deleteCatalog">
					<input type="hidden" name="confirm" value="true" />
					<Button type="submit" variant="destructive">Confirmar eliminación</Button>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>

	<AlertDialog.Root
		open={showItemDelete}
		onOpenChange={(open) => {
			if (!open && action?.pendingDelete) dismissedItemDeleteId = action.pendingDelete.itemId;
		}}
	>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>¿Eliminar «{action?.pendingDelete?.name ?? ''}»?</AlertDialog.Title>
				<AlertDialog.Description>
					Desvinculará {action?.pendingDelete?.impact.works ?? 0} trabajo(s), {action?.pendingDelete
						?.impact.elements ?? 0} elemento(s), {action?.pendingDelete?.impact.services ?? 0} servicio(s)
					de edificio y {action?.pendingDelete?.impact.requirements ?? 0} requisito(s). Conservarán su
					nombre y sus evidencias no se borran.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
				<form method="POST" action="?/deleteItem">
					<input type="hidden" name="itemId" value={action?.pendingDelete?.itemId ?? ''} />
					<input type="hidden" name="confirm" value="true" />
					<Button type="submit" variant="destructive">Confirmar eliminación</Button>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>

	<Dialog.Root bind:open={editOpen}>
		<Dialog.Content size="lg">
			<form
				method="POST"
				action="?/updateCatalog"
				class="flex min-h-0 flex-1 flex-col"
				use:enhance={submitCatalog}
			>
				<input type="hidden" name="catalogId" value={data.catalog.id} />
				<Dialog.Header>
					<Dialog.Title>Editar catálogo</Dialog.Title>
					<Dialog.Description>Nombre, tipo y ámbito de edificios.</Dialog.Description>
				</Dialog.Header>
				<Dialog.Context
					items={[
						{ label: 'Tipo', value: editType?.name ?? 'Sin tipo' },
						{ label: 'Ámbito', value: editScopeLabel, strong: true }
					]}
				/>
				<Dialog.Body class="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
					<Dialog.Section title="Identidad">
						<div class="space-y-2">
							<Label for="cat-name">Nombre</Label>
							<Input id="cat-name" name="name" value={data.catalog.name} required />
						</div>
						<div class="space-y-2">
							<Label for="cat-desc">Descripción</Label>
							<Textarea
								id="cat-desc"
								name="description"
								rows={2}
								value={data.catalog.description ?? ''}
							/>
						</div>
					</Dialog.Section>
					<Dialog.Section
						title="Dónde aparece"
						description="El tipo filtra la búsqueda y el ámbito decide en qué servicios se ofrece."
					>
						<div class="space-y-2">
							<Label for="cat-type">Tipo de catálogo</Label>
							<NativeSelect id="cat-type" name="typeId" bind:value={editTypeId} required>
								{#each data.types as type (type.id)}
									<option value={type.id}>{type.name}</option>
								{/each}
							</NativeSelect>
						</div>
						{#if !editIsBuildingType}
							<input
								type="hidden"
								name="allBuildings"
								value={editAllBuildings ? 'true' : 'false'}
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
										aria-pressed={editAllBuildings}
										class="rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 {editAllBuildings
											? 'bg-card text-foreground shadow-sm ring-1 ring-border/70'
											: 'text-muted-foreground hover:text-foreground'}"
										onclick={() => (editAllBuildings = true)}
									>
										Todos
									</button>
									<button
										type="button"
										aria-pressed={!editAllBuildings}
										class="rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 {!editAllBuildings
											? 'bg-card text-foreground shadow-sm ring-1 ring-border/70'
											: 'text-muted-foreground hover:text-foreground'}"
										onclick={() => (editAllBuildings = false)}
									>
										Edificios concretos
									</button>
								</div>
								<p class="text-xs text-muted-foreground">
									{#if editAllBuildings}
										Disponible en todos los servicios.
									{:else}
										Solo se ofrecerá en los servicios de los edificios elegidos.
									{/if}
								</p>
							</div>
							{#if !editAllBuildings}
								<div class="space-y-2">
									<Label>Edificios donde aparece</Label>
									<CatalogItemMultiPicker
										name="buildingIds"
										catalogs={data.buildingCatalogs}
										bind:value={editBuildingIds}
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
					{#if action?.message}
						<p class="text-sm text-destructive lg:col-span-2">{action.message}</p>
					{/if}
				</Dialog.Body>
				<Dialog.Footer>
					<Dialog.Close>Cancelar</Dialog.Close>
					<Button type="submit">Guardar cambios</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<Card.Root>
		<Card.Header class="flex flex-wrap items-center justify-between gap-2">
			<Card.Title class="text-base">Ítems ({data.total})</Card.Title>
			<div class="flex flex-wrap items-center gap-2">
				<form method="GET" class="flex gap-2">
					<Label for="item-search" class="sr-only">Buscar ítem</Label>
					<Input
						id="item-search"
						name="q"
						value={data.q}
						placeholder="Buscar ítem…"
						class="h-8 w-48"
					/>
					<Button type="submit" variant="outline" size="sm">Buscar</Button>
				</form>
				<Button size="sm" onclick={() => (itemOpen = true)}>Nuevo ítem</Button>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Dialog.Root bind:open={itemOpen}>
				<Dialog.Content>
					<form
						method="POST"
						action="?/createItem"
						class="flex min-h-0 flex-1 flex-col"
						use:enhance={submitItem}
					>
						<input type="hidden" name="catalogId" value={data.catalog.id} />
						<Dialog.Header>
							<Dialog.Title>Nuevo ítem</Dialog.Title>
							<Dialog.Description>Se añade al final de la lista.</Dialog.Description>
						</Dialog.Header>
						<Dialog.Body class="space-y-5">
							<div class="space-y-2">
								<Label for="item-name">Nombre</Label>
								<Input
									id="item-name"
									name="name"
									required
									aria-invalid={action?.createErrors?.name ? true : undefined}
									aria-describedby={action?.createErrors?.name ? 'item-name-error' : undefined}
								/>
								{#if action?.createErrors?.name}
									<p id="item-name-error" class="text-sm text-destructive">
										{action.createErrors.name}
									</p>
								{/if}
							</div>
						</Dialog.Body>
						<Dialog.Footer>
							<Dialog.Close>Cancelar</Dialog.Close>
							<Button type="submit">Añadir</Button>
						</Dialog.Footer>
					</form>
				</Dialog.Content>
			</Dialog.Root>

			{#if data.items.length === 0}
				<p class="text-sm text-muted-foreground">
					{data.q ? 'Sin ítems que coincidan con la búsqueda.' : 'Sin ítems.'}
				</p>
			{:else}
				<ul class="space-y-3 md:hidden">
					{#each data.items as item (item.id)}
						<li>
							<Card.Root class="transition-colors active:bg-muted/50">
								<Card.Content class="space-y-3">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<span class="font-medium">{item.name}</span>
										<Badge variant="secondary" class="tnum font-normal">
											{item.impact.works +
												item.impact.elements +
												item.impact.services +
												item.impact.requirements} uso(s)
										</Badge>
									</div>
									<div class="flex flex-wrap items-center gap-2">
										<RenameDialog
											action="?/renameItem"
											hiddenName="itemId"
											id={item.id}
											currentName={item.name}
										/>
										<form method="POST" action="?/moveItem">
											<input type="hidden" name="itemId" value={item.id} />
											<input type="hidden" name="direction" value="up" />
											<Button type="submit" variant="ghost" size="sm" aria-label="Subir ítem"
												>↑</Button
											>
										</form>
										<form method="POST" action="?/moveItem">
											<input type="hidden" name="itemId" value={item.id} />
											<input type="hidden" name="direction" value="down" />
											<Button type="submit" variant="ghost" size="sm" aria-label="Bajar ítem"
												>↓</Button
											>
										</form>
										<form method="POST" action="?/deleteItem">
											<input type="hidden" name="itemId" value={item.id} />
											<input type="hidden" name="confirm" value="false" />
											<Button type="submit" variant="destructive" size="sm">Eliminar</Button>
										</form>
									</div>
								</Card.Content>
							</Card.Root>
						</li>
					{/each}
				</ul>

				<div class="hidden md:block">
					<DataTable>
						<Table.Header>
							<Table.Row>
								<Table.Head>Ítem</Table.Head>
								<Table.Head class="hidden lg:table-cell">Usos</Table.Head>
								<Table.Head class="hidden w-px lg:table-cell">Orden</Table.Head>
								<Table.Head class="w-px text-right">Acciones</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.items as item (item.id)}
								<Table.Row>
									<Table.Cell class="whitespace-normal">
										<span class="mr-2 font-medium">{item.name}</span>
										<RenameDialog
											action="?/renameItem"
											hiddenName="itemId"
											id={item.id}
											currentName={item.name}
										/>
									</Table.Cell>
									<Table.Cell class="hidden lg:table-cell">
										<Badge variant="secondary" class="tnum font-normal">
											{item.impact.works} trabajo(s) · {item.impact.elements} elemento(s) · {item
												.impact.services} edificio(s) · {item.impact.requirements} requisito(s)
										</Badge>
									</Table.Cell>
									<Table.Cell class="hidden lg:table-cell">
										<div class="flex items-center gap-1">
											<form method="POST" action="?/moveItem">
												<input type="hidden" name="itemId" value={item.id} />
												<input type="hidden" name="direction" value="up" />
												<Button type="submit" variant="ghost" size="sm" aria-label="Subir ítem"
													>↑</Button
												>
											</form>
											<form method="POST" action="?/moveItem">
												<input type="hidden" name="itemId" value={item.id} />
												<input type="hidden" name="direction" value="down" />
												<Button type="submit" variant="ghost" size="sm" aria-label="Bajar ítem"
													>↓</Button
												>
											</form>
										</div>
									</Table.Cell>
									<Table.Cell class="text-right">
										<TableActions>
											<form method="POST" action="?/deleteItem">
												<input type="hidden" name="itemId" value={item.id} />
												<input type="hidden" name="confirm" value="false" />
												<Button type="submit" variant="destructive" size="sm">Eliminar</Button>
											</form>
										</TableActions>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</DataTable>
				</div>

				{#if totalPages > 1}
					<div class="flex items-center justify-between gap-2">
						<span class="tnum text-sm text-muted-foreground"
							>Página {data.page} de {totalPages}</span
						>
						<div class="flex gap-2">
							{#if data.page > 1}
								<Button href={pageHref(data.page - 1)} variant="outline" size="sm">Anterior</Button>
							{/if}
							{#if data.page < totalPages}
								<Button href={pageHref(data.page + 1)} variant="outline" size="sm">Siguiente</Button
								>
							{/if}
						</div>
					</div>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
