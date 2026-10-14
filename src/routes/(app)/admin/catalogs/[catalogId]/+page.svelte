<script lang="ts">
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
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
</script>

<svelte:head>
	<title>{data.catalog.name} · Catálogo · Lumen</title>
</svelte:head>

<div class="space-y-6">
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
		<Card.Header><Card.Title class="text-base">Ítems</Card.Title></Card.Header>
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
				<p class="text-sm text-muted-foreground">Sin ítems.</p>
			{:else}
				<ul class="divide-y">
					{#each data.items as item (item.id)}
						<li class="flex flex-wrap items-center justify-between gap-2 py-2">
							<form method="POST" action="?/renameItem" class="flex items-center gap-2">
								<input type="hidden" name="itemId" value={item.id} />
								<Input name="name" value={item.name} aria-label="Nombre del ítem" class="h-8" />
								<Button type="submit" variant="outline" size="sm">Renombrar</Button>
							</form>
							<form method="POST" action="?/deleteItem">
								<input type="hidden" name="itemId" value={item.id} />
								<input type="hidden" name="confirm" value="false" />
								<Button type="submit" variant="destructive" size="sm">Eliminar</Button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Relaciones</Card.Title></Card.Header>
		<Card.Content class="space-y-4">
			<form method="POST" action="?/createRelation" class="grid gap-3 sm:grid-cols-4">
				<div class="space-y-1">
					<Label for="rel-from">Ítem de este catálogo</Label>
					<select
						id="rel-from"
						name="fromItemId"
						required
						class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
					>
						{#each data.items as item (item.id)}
							<option value={item.id}>{item.name}</option>
						{/each}
					</select>
				</div>
				<div class="space-y-1">
					<Label for="rel-to">Ítem de otro catálogo</Label>
					<select
						id="rel-to"
						name="toItemId"
						required
						class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
					>
						{#each data.otherItems as item (item.id)}
							<option value={item.id}>{item.catalogName} · {item.name}</option>
						{/each}
					</select>
				</div>
				<div class="space-y-1">
					<Label for="rel-type">Tipo (opcional)</Label>
					<Input id="rel-type" name="relationType" />
				</div>
				<div class="flex items-end">
					<Button
						type="submit"
						size="sm"
						disabled={data.items.length === 0 || data.otherItems.length === 0}>Relacionar</Button
					>
				</div>
			</form>

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
