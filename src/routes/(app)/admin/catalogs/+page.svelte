<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import type { PageProps } from './$types';

	type ActionData = {
		success?: string;
		message?: string;
		createErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let createOpen = $state(false);
	$effect(() => {
		if (action?.success) createOpen = false;
	});

	const purposeLabel = { general: 'General', buildings: 'Edificios' } as const;
</script>

<svelte:head>
	<title>Catálogos · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Catálogos"
		description="Listas reutilizables (edificios, pisos, equipos…) para nombrar trabajos y elementos."
	>
		<Button onclick={() => (createOpen = true)}>Nuevo catálogo</Button>
	</PageHeader>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<Dialog.Root bind:open={createOpen}>
		<Dialog.Content>
			<form method="POST" action="?/create" class="space-y-4">
				<Dialog.Header>
					<Dialog.Title>Nuevo catálogo</Dialog.Title>
					<Dialog.Description>
						Los catálogos agrupan ítems reutilizables para nombrar trabajos y elementos.
					</Dialog.Description>
				</Dialog.Header>
				<div class="space-y-2">
					<Label for="name">Nombre</Label>
					<Input id="name" name="name" required />
					{#if action?.createErrors?.name}
						<p class="text-sm text-destructive">{action.createErrors.name}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="description">Descripción (opcional)</Label>
					<Input id="description" name="description" />
				</div>
				<div class="space-y-2">
					<Label for="purpose">Propósito</Label>
					<select
						id="purpose"
						name="purpose"
						class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
					>
						<option value="">General</option>
						<option value="buildings">Edificios</option>
					</select>
				</div>
				<Dialog.Footer>
					<Dialog.Close>Cancelar</Dialog.Close>
					<Button type="submit">Crear catálogo</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<form method="GET" class="flex gap-2">
		<Input name="q" value={data.q} placeholder="Buscar catálogo…" class="max-w-xs" />
		<Button type="submit" variant="outline">Buscar</Button>
	</form>

	{#if data.catalogs.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-sm text-muted-foreground">
				{data.q ? 'Sin catálogos que coincidan.' : 'Aún no hay catálogos.'}
			</Card.Content>
		</Card.Root>
	{:else}
		<ul class="space-y-3">
			{#each data.catalogs as catalog (catalog.id)}
				<li>
					<Card.Root>
						<Card.Header>
							<Card.Title class="flex items-center gap-2 text-base">
								{catalog.name}
								{#if catalog.purpose}
									<Badge variant="secondary">{purposeLabel[catalog.purpose]}</Badge>
								{/if}
							</Card.Title>
							{#if catalog.description}
								<Card.Description>{catalog.description}</Card.Description>
							{/if}
						</Card.Header>
						<Card.Footer class="gap-2">
							<span class="text-sm text-muted-foreground">{catalog.itemCount} ítem(s)</span>
							<Button
								href={resolve('/(app)/admin/catalogs/[catalogId]', { catalogId: catalog.id })}
								variant="outline"
								size="sm">Ver ítems</Button
							>
						</Card.Footer>
					</Card.Root>
				</li>
			{/each}
		</ul>
	{/if}
</div>
