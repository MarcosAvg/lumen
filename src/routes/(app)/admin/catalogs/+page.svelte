<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Tabs from '#lib/components/ui/tabs';
	import * as Table from '#lib/components/ui/table';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import PageIntro from '#lib/components/app/page-intro.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import type { PageProps } from './$types';
	import { NativeSelect } from '#lib/components/ui/native-select';

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

	const purposeLabel = {
		general: 'General',
		buildings: 'Edificios',
		requirements: 'Requisitos'
	} as const;

	type FilterTab = 'all' | 'general' | 'buildings' | 'requirements';
	let tab = $state<FilterTab>('all');

	const counts = $derived.by(() => {
		const result = { all: data.catalogs.length, general: 0, buildings: 0, requirements: 0 };
		for (const catalog of data.catalogs) {
			if (catalog.purpose === 'buildings') result.buildings += 1;
			else if (catalog.purpose === 'requirements') result.requirements += 1;
			else result.general += 1;
		}
		return result;
	});

	const visibleCatalogs = $derived(
		tab === 'all'
			? data.catalogs
			: data.catalogs.filter((catalog) =>
					tab === 'general'
						? catalog.purpose === null || catalog.purpose === 'general'
						: catalog.purpose === tab
				)
	);
</script>

<svelte:head>
	<title>Catálogos · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageIntro
		description="Listas reutilizables (edificios, pisos, equipos…) para nombrar trabajos y elementos."
	>
		<Button onclick={() => (createOpen = true)}>Nuevo catálogo</Button>
	</PageIntro>

	{#if action?.success}
		<Alert role="status">
			<AlertDescription>{action.success}</AlertDescription>
		</Alert>
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
					<Input id="description" name="description" />
				</div>
				<div class="space-y-2">
					<Label for="purpose">Propósito</Label>
					<NativeSelect id="purpose" name="purpose">
						<option value="">General</option>
						<option value="buildings">Edificios</option>
						<option value="requirements">Requisitos</option>
					</NativeSelect>
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

	<Tabs.Root bind:value={tab}>
		<Tabs.List class="no-scrollbar max-w-full overflow-x-auto">
			<Tabs.Trigger value="all">Todos ({counts.all})</Tabs.Trigger>
			<Tabs.Trigger value="general">Generales ({counts.general})</Tabs.Trigger>
			<Tabs.Trigger value="buildings">Edificios ({counts.buildings})</Tabs.Trigger>
			<Tabs.Trigger value="requirements">Requisitos ({counts.requirements})</Tabs.Trigger>
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
								{#if catalog.purpose}
									<Badge variant="secondary" class="shrink-0">{purposeLabel[catalog.purpose]}</Badge
									>
								{/if}
							</div>
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
							<Table.Cell>
								{#if catalog.purpose}
									<Badge variant="secondary">{purposeLabel[catalog.purpose]}</Badge>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
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
</div>
