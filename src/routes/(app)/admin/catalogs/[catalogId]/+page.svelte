<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import * as Table from '#lib/components/ui/table';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import CatalogItemRelationsDialog from '#lib/components/catalog/catalog-item-relations-dialog.svelte';
	import CatalogRelationsBatchDialog from '#lib/components/catalog/catalog-relations-batch-dialog.svelte';
	import type { CatalogGroup } from '#lib/components/catalog/types';
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

	const currentCatalog = $derived<CatalogGroup>({
		id: data.catalog.id,
		name: data.catalog.name,
		items: data.fromItems.map((item) => ({ id: item.id, name: item.name }))
	});
	const otherCatalogs = $derived<CatalogGroup[]>(
		data.otherCatalogs.map((catalog) => ({
			id: catalog.id,
			name: catalog.name,
			items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
		}))
	);

	const relationCountByItem = $derived.by(() => {
		const counts = new SvelteMap<string, number>();
		for (const relation of data.relations) {
			counts.set(relation.fromItemId, (counts.get(relation.fromItemId) ?? 0) + 1);
			counts.set(relation.toItemId, (counts.get(relation.toItemId) ?? 0) + 1);
		}
		return counts;
	});

	let itemRelationsOpen = $state(false);
	let itemRelationsTarget = $state<{ id: string; name: string } | null>(null);
	let batchOpen = $state(false);
	let removingRelationId = $state<string | null>(null);

	function openItemRelations(item: { id: string; name: string }) {
		itemRelationsTarget = { id: item.id, name: item.name };
		itemRelationsOpen = true;
	}

	async function removeRelation(relationId: string) {
		removingRelationId = relationId;
		try {
			const response = await fetch(`/api/catalogs/${data.catalog.id}/relations/${relationId}`, {
				method: 'DELETE'
			});
			const body = (await response.json().catch(() => ({}))) as { message?: string };
			if (!response.ok) throw new Error(body.message ?? 'No se pudo quitar la relación.');
			toast.success('Relación eliminada.');
			await invalidateAll();
		} catch (cause) {
			toast.error((cause as Error).message);
		} finally {
			removingRelationId = null;
		}
	}

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

	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-xl font-semibold tracking-tight lg:text-3xl">{data.catalog.name}</h1>
			{#if data.catalog.description}
				<p class="text-sm text-muted-foreground">{data.catalog.description}</p>
			{/if}
		</div>
		<form method="POST" action="?/deleteCatalog">
			<input type="hidden" name="confirm" value="false" />
			<Button type="submit" variant="destructive" size="sm">Eliminar catálogo</Button>
		</form>
	</div>

	{#if action?.success}
		<Alert role="status">
			<AlertDescription>{action.success}</AlertDescription>
		</Alert>
	{/if}
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

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Datos del catálogo</Card.Title></Card.Header>
		<Card.Content>
			<form method="POST" action="?/updateCatalog" class="grid gap-4 sm:grid-cols-3">
				<input type="hidden" name="catalogId" value={data.catalog.id} />
				<div class="space-y-2">
					<Label for="cat-name">Nombre</Label>
					<Input id="cat-name" name="name" value={data.catalog.name} required />
				</div>
				<div class="space-y-2">
					<Label for="cat-desc">Descripción</Label>
					<Input id="cat-desc" name="description" value={data.catalog.description ?? ''} />
				</div>
				<div class="space-y-2">
					<Label for="cat-purpose">Propósito</Label>
					<NativeSelect id="cat-purpose" name="purpose" value={data.catalog.purpose ?? ''}>
						<option value="">General</option>
						<option value="buildings">Edificios</option>
						<option value="requirements">Requisitos</option>
					</NativeSelect>
				</div>
				<div class="sm:col-span-3">
					<Button type="submit" variant="outline" size="sm">Guardar cambios</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="flex flex-wrap items-center justify-between gap-2">
			<Card.Title class="text-base">Ítems ({data.total})</Card.Title>
			<form method="GET" class="flex gap-2">
				<Input name="q" value={data.q} placeholder="Buscar ítem…" class="h-8 w-48" />
				<Button type="submit" variant="outline" size="sm">Buscar</Button>
			</form>
		</Card.Header>
		<Card.Content class="space-y-4">
			<form method="POST" action="?/createItem" class="flex flex-wrap items-end gap-2">
				<input type="hidden" name="catalogId" value={data.catalog.id} />
				<div class="space-y-1">
					<Label for="item-name">Nuevo ítem</Label>
					<Input
						id="item-name"
						name="name"
						required
						aria-invalid={action?.createErrors?.name ? true : undefined}
						aria-describedby={action?.createErrors?.name ? 'item-name-error' : undefined}
					/>
					{#if action?.createErrors?.name}
						<p id="item-name-error" class="text-sm text-destructive">{action.createErrors.name}</p>
					{/if}
				</div>
				<Button type="submit">Añadir</Button>
			</form>

			{#if data.items.length === 0}
				<p class="text-sm text-muted-foreground">
					{data.q ? 'Sin ítems que coincidan con la búsqueda.' : 'Sin ítems.'}
				</p>
			{:else}
				<div class="overflow-hidden rounded-lg border">
					<Table.Root
						class="[&_td]:px-3 [&_td]:py-2 [&_th]:h-10 [&_th]:px-3 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground"
					>
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
										<form method="POST" action="?/renameItem" class="flex items-center gap-2">
											<input type="hidden" name="itemId" value={item.id} />
											<Input
												name="name"
												value={item.name}
												aria-label="Nombre del ítem"
												class="h-8 max-w-xs"
											/>
											<Button type="submit" variant="outline" size="sm">Renombrar</Button>
										</form>
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
										<div class="flex items-center justify-end gap-2">
											<Button
												type="button"
												variant="outline"
												size="sm"
												onclick={() => openItemRelations(item)}
											>
												Relaciones ({relationCountByItem.get(item.id) ?? 0})
											</Button>
											<form method="POST" action="?/deleteItem">
												<input type="hidden" name="itemId" value={item.id} />
												<input type="hidden" name="confirm" value="false" />
												<Button type="submit" variant="destructive" size="sm">Eliminar</Button>
											</form>
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
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

	<Card.Root>
		<Card.Header class="flex flex-wrap items-center justify-between gap-2">
			<Card.Title class="text-base">Relaciones</Card.Title>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={data.otherCatalogs.length === 0}
				onclick={() => (batchOpen = true)}>Relacionar en lote</Button
			>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.otherCatalogs.length === 0}
				<p class="text-sm text-muted-foreground">
					No hay otros catálogos para relacionar. Crea otro catálogo primero.
				</p>
			{:else}
				<p class="text-sm text-muted-foreground">
					Añade o quita las relaciones de cada ítem desde «Relaciones» en la lista de ítems, o crea
					varias a la vez con «Relacionar en lote».
				</p>
			{/if}

			{#if data.relations.length === 0}
				<p class="text-sm text-muted-foreground">Sin relaciones.</p>
			{:else}
				<ul class="divide-y">
					{#each data.relations as relation (relation.id)}
						<li class="flex items-center justify-between gap-2 py-2 text-sm">
							<span class="flex flex-wrap items-center gap-2">
								{relation.fromName}
								<span class="text-muted-foreground">→</span>
								{relation.toName}
								{#if relation.relationType}
									<Badge variant="secondary">{relation.relationType}</Badge>
								{/if}
							</span>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								disabled={removingRelationId === relation.id}
								onclick={() => removeRelation(relation.id)}>Quitar</Button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<CatalogItemRelationsDialog
		bind:open={itemRelationsOpen}
		catalogId={data.catalog.id}
		item={itemRelationsTarget}
		relations={data.relations}
		{otherCatalogs}
	/>

	<CatalogRelationsBatchDialog
		bind:open={batchOpen}
		catalogId={data.catalog.id}
		{currentCatalog}
		relations={data.relations}
		{otherCatalogs}
	/>
</div>
