<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import type { PageProps } from './$types';

	type ActionData = {
		success?: string;
		message?: string;
		createErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	const purposeLabel = { general: 'General', buildings: 'Edificios' } as const;
</script>

<svelte:head>
	<title>Catálogos · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Catálogos</h1>
		<p class="text-sm text-muted-foreground">
			Listas reutilizables (edificios, pisos, equipos…) para nombrar trabajos y elementos.
		</p>
	</div>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Nuevo catálogo</Card.Title></Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" class="grid gap-4 sm:grid-cols-3">
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
				<div class="sm:col-span-3">
					<Button type="submit">Crear catálogo</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	{#if data.catalogs.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-sm text-muted-foreground">
				Aún no hay catálogos.
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
