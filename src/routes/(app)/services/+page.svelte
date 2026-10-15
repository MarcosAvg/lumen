<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card';
	import * as Table from '#lib/components/ui/table';
	import PageIntro from '#lib/components/app/page-intro.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import ProgressMeter from '#lib/components/app/progress-meter.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const isAdmin = $derived(data.user.role === 'admin');
</script>

<svelte:head>
	<title>Servicios · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageIntro
		description={isAdmin
			? 'Todos los servicios. La gestión de estructura está en Administración.'
			: 'Servicios activos en los que participas.'}
	/>

	{#if data.services.length === 0}
		<EmptyState
			title="Aún no hay servicios"
			description={isAdmin
				? 'Crea el primer servicio para empezar a estructurar trabajos y evidencia.'
				: 'No tienes servicios asignados. Contacta con un administrador.'}
		/>
	{:else}
		<ul class="space-y-3 md:hidden">
			{#each data.services as service (service.id)}
				<li class="relative">
					<Card.Root class="transition-colors active:bg-muted/50">
						<Card.Content class="space-y-2">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<a
									class="font-medium text-foreground after:absolute after:inset-0"
									href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
								>
									{service.name}
								</a>
								<span class="text-sm font-medium text-primary">Abrir →</span>
							</div>
							{#if service.buildingName}
								<p class="text-xs text-muted-foreground">Edificio: {service.buildingName}</p>
							{/if}
							<ProgressMeter
								approved={service.approvedTargets}
								total={service.totalTargets}
								percent={service.percent}
								completed={service.totalTargets > 0 &&
									service.approvedTargets === service.totalTargets}
							/>
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
						<Table.Head class="w-40">Progreso</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.services as service (service.id)}
						<Table.Row class="relative">
							<Table.Cell class="whitespace-normal">
								<a
									class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
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
							<Table.Cell>
								<ProgressMeter
									approved={service.approvedTargets}
									total={service.totalTargets}
									percent={service.percent}
									completed={service.totalTargets > 0 &&
										service.approvedTargets === service.totalTargets}
								/>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</DataTable>
		</div>
	{/if}
</div>
