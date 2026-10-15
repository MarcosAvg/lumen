<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Table from '#lib/components/ui/table';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Inicio · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Hola, {data.user.displayName}" description="Servicios a los que tienes acceso."
	></PageHeader>

	{#if data.services.length === 0}
		<EmptyState
			title="Aún no hay servicios"
			description={data.user.role === 'admin'
				? 'Crea el primer servicio para empezar a estructurar trabajos y evidencia.'
				: 'No tienes servicios asignados. Contacta con un administrador.'}
		>
			{#if data.user.role === 'admin'}
				<Button href={resolve('/(app)/admin/services')} size="sm">Ir a Servicios</Button>
			{/if}
		</EmptyState>
	{:else}
		<ul class="space-y-3 md:hidden">
			{#each data.services as service (service.id)}
				<li class="relative">
					<Card.Root>
						<Card.Content>
							<a
								class="font-medium text-foreground after:absolute after:inset-0"
								href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
							>
								{service.name}
							</a>
							{#if service.description}
								<p class="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
									{service.description}
								</p>
							{/if}
							{#if service.buildingName}
								<p class="mt-1 text-xs text-muted-foreground">Edificio: {service.buildingName}</p>
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
						<Table.Head>Servicio</Table.Head>
						<Table.Head class="hidden lg:table-cell">Edificio</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.services as service (service.id)}
						<Table.Row>
							<Table.Cell class="whitespace-normal">
								<a
									class="font-medium text-foreground underline-offset-4 hover:underline"
									href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
								>
									{service.name}
								</a>
								{#if service.description}
									<p class="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
										{service.description}
									</p>
								{/if}
							</Table.Cell>
							<Table.Cell class="hidden text-muted-foreground lg:table-cell">
								{service.buildingName ?? '—'}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</DataTable>
		</div>
	{/if}
</div>
