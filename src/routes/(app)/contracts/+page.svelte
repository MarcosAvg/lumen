<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import * as Table from '#lib/components/ui/table';
	import PageIntro from '#lib/components/app/page-intro.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import LifecycleBadge from '#lib/components/app/lifecycle-badge.svelte';
	import LifecycleFilter from '#lib/components/app/lifecycle-filter.svelte';
	import type { ContractLifecycle } from '#lib/types';
	import type { PageProps } from './$types';

	type ActionData = { success?: string; message?: string; createErrors?: Record<string, string> };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let createOpen = $state(false);
	let lifecycleFilter = $state<ContractLifecycle>('active');

	const options = $derived(
		[
			{ value: 'active' as const, label: 'Activos' },
			{ value: 'inactive' as const, label: 'Inactivos' },
			{ value: 'archived' as const, label: 'Archivados' }
		].map((option) => ({
			...option,
			count: data.contracts.filter((contract) => contract.lifecycle === option.value).length
		}))
	);
	const visibleContracts = $derived(
		data.contracts.filter((contract) => contract.lifecycle === lifecycleFilter)
	);

	$effect(() => {
		if (action?.success) createOpen = false;
	});
</script>

<svelte:head>
	<title>Contratos · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageIntro
		description="Un contrato agrupa servicios y define qué técnicos y supervisores participan en ellos."
	>
		{#if data.isAdmin}
			<Button onclick={() => (createOpen = true)}>Nuevo contrato</Button>
		{/if}
	</PageIntro>

	{#if action?.success}
		<Alert role="status"><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	{#if data.isAdmin}
		<Dialog.Root bind:open={createOpen}>
			<Dialog.Content>
				<form method="POST" action="?/create" class="flex min-h-0 flex-1 flex-col">
					<Dialog.Header>
						<Dialog.Title>Nuevo contrato</Dialog.Title>
						<Dialog.Description>
							Después podrás añadir participantes y asignarles servicios.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body class="space-y-5">
						<Dialog.Section title="Datos">
							<div class="space-y-2">
								<Label for="contract-name">Nombre</Label>
								<Input
									id="contract-name"
									name="name"
									required
									aria-invalid={action?.createErrors?.name ? true : undefined}
								/>
								{#if action?.createErrors?.name}
									<p class="text-sm text-destructive">{action.createErrors.name}</p>
								{/if}
							</div>
							<div class="space-y-2">
								<Label for="contract-description">Descripción (opcional)</Label>
								<Input id="contract-description" name="description" />
							</div>
						</Dialog.Section>
					</Dialog.Body>
					<Dialog.Footer>
						<Dialog.Close>Cancelar</Dialog.Close>
						<Button type="submit">Crear contrato</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	{/if}

	{#if data.contracts.length === 0}
		<EmptyState
			title="Aún no hay contratos"
			description={data.isAdmin
				? 'Crea el primero para agrupar servicios y participantes.'
				: 'No participas en ningún contrato. Contacta con un administrador.'}
		/>
	{:else}
		<LifecycleFilter bind:value={lifecycleFilter} {options} label="Filtrar contratos" />

		{#if visibleContracts.length === 0}
			<EmptyState
				title="No hay contratos {lifecycleFilter === 'active'
					? 'activos'
					: lifecycleFilter === 'inactive'
						? 'inactivos'
						: 'archivados'}"
				description="Cambia el filtro para consultar otros contratos."
			/>
		{:else}
			<ul class="space-y-3 md:hidden">
				{#each visibleContracts as contract (contract.id)}
					<li class="relative">
						<Card.Root class="transition-colors active:bg-muted/50">
							<Card.Content>
								<div class="flex flex-wrap items-center gap-2">
									<a
										class="font-medium text-foreground after:absolute after:inset-0"
										href={resolve('/(app)/contracts/[contractId]', { contractId: contract.id })}
									>
										{contract.name}
									</a>
									<LifecycleBadge lifecycle={contract.lifecycle} kind="contract" />
								</div>
								<p class="mt-0.5 text-sm text-muted-foreground">
									{contract.serviceCount} servicio(s)
								</p>
								{#if contract.description}
									<p class="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
										{contract.description}
									</p>
								{/if}
							</Card.Content>
						</Card.Root>
					</li>
				{/each}
			</ul>

			<div class="hidden md:block">
				<DataTable>
					<Table.Header>
						<Table.Row>
							<Table.Head>Contrato</Table.Head>
							<Table.Head class="w-px text-right">Servicios</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each visibleContracts as contract (contract.id)}
							<Table.Row class="relative">
								<Table.Cell class="whitespace-normal">
									<div class="flex flex-wrap items-center gap-2">
										<a
											class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
											href={resolve('/(app)/contracts/[contractId]', { contractId: contract.id })}
										>
											{contract.name}
										</a>
										<LifecycleBadge lifecycle={contract.lifecycle} kind="contract" />
									</div>
									{#if contract.description}
										<p class="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
											{contract.description}
										</p>
									{/if}
								</Table.Cell>
								<Table.Cell class="tnum text-right text-muted-foreground"
									>{contract.serviceCount}</Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</DataTable>
			</div>
		{/if}
	{/if}
</div>
