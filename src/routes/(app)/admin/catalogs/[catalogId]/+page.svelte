<script lang="ts">
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import CatalogItemPicker from '#lib/components/catalog/catalog-item-picker.svelte';
	import type { CatalogItemOption } from '#lib/components/catalog/types';
	import type { PageProps } from './$types';

	type Impact = { works: number; elements: number; services: number };
	type ActionData = {
		success?: string;
		message?: string;
		createErrors?: Record<string, string>;
		pendingDelete?: { itemId: string; name: string; impact: Impact };
		pendingCatalogDelete?: { catalogId: string; name: string; itemCount: number };
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	const totalPages = $derived(Math.max(Math.ceil(data.total / data.pageSize), 1));

	let relationCatalogId = $state('');
	let fromItemId = $state('');
	let toItemId = $state('');

	$effect(() => {
		if (!relationCatalogId && data.otherCatalogs.length > 0) {
			relationCatalogId = data.otherCatalogs[0].id;
		}
	});

	const fromItems = $derived<CatalogItemOption[]>(
		data.items.map((item) => ({ id: item.id, name: item.name, catalogName: data.catalog.name }))
	);
	const toItems = $derived<CatalogItemOption[]>(
		(data.otherCatalogs.find((entry) => entry.id === relationCatalogId)?.items ?? []).map(
			(item) => ({ id: item.id, name: item.name, catalogName: '' })
		)
	);

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
			<h1 class="text-2xl font-semibold tracking-tight">{data.catalog.name}</h1>
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
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	{#if action?.pendingCatalogDelete}
		<Alert variant="destructive">
			<AlertDescription>
				<p class="mb-2">
					¿Eliminar «{action.pendingCatalogDelete.name}»? Sus {action.pendingCatalogDelete
						.itemCount} ítem(s) se desvincularán y los objetos conservarán su nombre. No se borran evidencias.
				</p>
				<form method="POST" action="?/deleteCatalog">
					<input type="hidden" name="confirm" value="true" />
					<Button type="submit" variant="destructive" size="sm">Confirmar eliminación</Button>
				</form>
			</AlertDescription>
		</Alert>
	{/if}

	{#if action?.pendingDelete}
		<Alert variant="destructive">
			<AlertDescription>
				<p class="mb-2">
					Eliminar «{action.pendingDelete.name}» desvinculará {action.pendingDelete.impact.works} trabajo(s),
					{action.pendingDelete.impact.elements} elemento(s) y {action.pendingDelete.impact
						.services} servicio(s) de edificio. Conservarán su nombre y sus evidencias no se borran.
				</p>
				<form method="POST" action="?/deleteItem">
					<input type="hidden" name="itemId" value={action.pendingDelete.itemId} />
					<input type="hidden" name="confirm" value="true" />
					<Button type="submit" variant="destructive" size="sm">Confirmar eliminación</Button>
				</form>
			</AlertDescription>
		</Alert>
	{/if}

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
					<select
						id="cat-purpose"
						name="purpose"
						class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						value={data.catalog.purpose ?? ''}
					>
						<option value="">General</option>
						<option value="buildings">Edificios</option>
					</select>
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
					<Input id="item-name" name="name" required />
					{#if action?.createErrors?.name}
						<p class="text-sm text-destructive">{action.createErrors.name}</p>
					{/if}
				</div>
				<Button type="submit" size="sm">Añadir</Button>
			</form>

			{#if data.items.length === 0}
				<p class="text-sm text-muted-foreground">
					{data.q ? 'Sin ítems que coincidan con la búsqueda.' : 'Sin ítems.'}
				</p>
			{:else}
				<ul class="divide-y">
					{#each data.items as item (item.id)}
						<li class="flex flex-wrap items-center justify-between gap-2 py-2">
							<form method="POST" action="?/renameItem" class="flex items-center gap-2">
								<input type="hidden" name="itemId" value={item.id} />
								<Input name="name" value={item.name} aria-label="Nombre del ítem" class="h-8" />
								<Button type="submit" variant="outline" size="sm">Renombrar</Button>
							</form>
							<div class="flex items-center gap-2">
								<Badge variant="secondary">
									{item.impact.works} trabajo(s) · {item.impact.elements} elemento(s) · {item.impact
										.services} edificio(s)
								</Badge>
								<form method="POST" action="?/moveItem">
									<input type="hidden" name="itemId" value={item.id} />
									<input type="hidden" name="direction" value="up" />
									<Button type="submit" variant="ghost" size="sm" aria-label="Subir ítem">↑</Button>
								</form>
								<form method="POST" action="?/moveItem">
									<input type="hidden" name="itemId" value={item.id} />
									<input type="hidden" name="direction" value="down" />
									<Button type="submit" variant="ghost" size="sm" aria-label="Bajar ítem">↓</Button>
								</form>
								<form method="POST" action="?/deleteItem">
									<input type="hidden" name="itemId" value={item.id} />
									<input type="hidden" name="confirm" value="false" />
									<Button type="submit" variant="destructive" size="sm">Eliminar</Button>
								</form>
							</div>
						</li>
					{/each}
				</ul>

				{#if totalPages > 1}
					<div class="flex items-center justify-between gap-2">
						<span class="text-sm text-muted-foreground">Página {data.page} de {totalPages}</span>
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
		<Card.Header><Card.Title class="text-base">Relaciones</Card.Title></Card.Header>
		<Card.Content class="space-y-4">
			{#if data.otherCatalogs.length === 0}
				<p class="text-sm text-muted-foreground">
					No hay otros catálogos para relacionar. Crea otro catálogo primero.
				</p>
			{:else}
				<form method="POST" action="?/createRelation" class="grid gap-3 sm:grid-cols-4">
					<div class="space-y-1">
						<Label for="rel-from">Ítem de este catálogo</Label>
						<CatalogItemPicker
							name="fromItemId"
							items={fromItems}
							bind:value={fromItemId}
							placeholder="Elige ítem…"
						/>
					</div>
					<div class="space-y-1">
						<Label for="rel-catalog">Catálogo destino</Label>
						<select
							id="rel-catalog"
							class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
							bind:value={relationCatalogId}
						>
							{#each data.otherCatalogs as catalog (catalog.id)}
								<option value={catalog.id}>{catalog.name}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-1">
						<Label for="rel-to">Ítem destino</Label>
						<CatalogItemPicker
							name="toItemId"
							items={toItems}
							bind:value={toItemId}
							placeholder="Elige ítem…"
						/>
					</div>
					<div class="flex items-end">
						<Button
							type="submit"
							size="sm"
							disabled={data.items.length === 0 || !fromItemId || !toItemId}>Relacionar</Button
						>
					</div>
				</form>
			{/if}

			{#if data.relations.length === 0}
				<p class="text-sm text-muted-foreground">Sin relaciones.</p>
			{:else}
				<ul class="divide-y">
					{#each data.relations as relation (relation.id)}
						<li class="flex items-center justify-between gap-2 py-2 text-sm">
							<span class="flex flex-wrap items-center gap-2">
								{relation.fromName}
								<span class="text-muted-foreground">↔</span>
								{relation.toName}
								{#if relation.relationType}
									<Badge variant="secondary">{relation.relationType}</Badge>
								{/if}
							</span>
							<form method="POST" action="?/deleteRelation">
								<input type="hidden" name="relationId" value={relation.id} />
								<Button type="submit" variant="destructive" size="sm">Quitar</Button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
