<script lang="ts">
	import { resolve } from '$app/paths';
	import Building2 from '@lucide/svelte/icons/building-2';
	import * as Card from '#lib/components/ui/card';
	import * as Table from '#lib/components/ui/table';
	import PageIntro from '#lib/components/app/page-intro.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import ProgressMeter from '#lib/components/app/progress-meter.svelte';
	import LifecycleBadge from '#lib/components/app/lifecycle-badge.svelte';
	import LifecycleFilter from '#lib/components/app/lifecycle-filter.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import { matchesServiceFilter, type ServiceFilter } from '#lib/service-filters';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const isAdmin = $derived(data.user.role === 'admin');
	const allowedFilters: ServiceFilter[] = [
		'active',
		'completed',
		'planned',
		'inactive',
		'archived'
	];
	let lifecycleFilter = $state<ServiceFilter>('active');
	const labels: Record<ServiceFilter, string> = {
		active: 'Activos',
		completed: 'Completados',
		planned: 'En espera',
		inactive: 'Inactivos',
		archived: 'Archivados'
	};

	const options = $derived(
		allowedFilters.map((value) => ({
			value,
			label: labels[value],
			count: data.services.filter((service) => matchesServiceFilter(service, value)).length
		}))
	);
	const visibleServices = $derived(
		data.services.filter((service) => matchesServiceFilter(service, lifecycleFilter))
	);
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
			Icon={Building2}
			title="Aún no hay servicios"
			description={isAdmin
				? 'Crea el primer servicio para empezar a estructurar trabajos y evidencia.'
				: 'No tienes servicios asignados. Contacta con un administrador.'}
		/>
	{:else}
		<LifecycleFilter bind:value={lifecycleFilter} {options} label="Filtrar servicios" />

		{#if visibleServices.length === 0}
			<EmptyState
				Icon={Building2}
				title="No hay servicios {labels[lifecycleFilter].toLowerCase()}"
				description="Cambia el filtro para consultar otros servicios."
			/>
		{:else}
			<ul class="space-y-3 md:hidden">
				{#each visibleServices as service (service.id)}
					<li class="relative">
						<Card.Root
							class="border-l-2 transition-colors active:bg-muted/50 {service.totalTargets > 0 &&
							service.approvedTargets === service.totalTargets
								? 'border-l-teal'
								: 'border-l-primary/40'}"
						>
							<Card.Content class="space-y-2">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<a
										class="font-medium text-foreground after:absolute after:inset-0"
										href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
									>
										{service.name}
									</a>
									<div class="flex flex-wrap items-center gap-2">
										<LifecycleBadge lifecycle={service.lifecycle} />
										{#if service.completed}
											<StatusBadge status="approved" label="Completado" />
										{/if}
									</div>
								</div>
								{#if service.buildingName}
									<p class="text-xs text-muted-foreground">Edificio: {service.buildingName}</p>
								{/if}
								<ProgressMeter
									approved={service.approvedTargets}
									total={service.totalTargets}
									percent={service.percent}
									completed={service.completed}
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
						{#each visibleServices as service (service.id)}
							<Table.Row class="relative">
								<Table.Cell class="whitespace-normal">
									<div class="flex flex-wrap items-center gap-2">
										<a
											class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
											href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
										>
											{service.name}
										</a>
										<LifecycleBadge lifecycle={service.lifecycle} />
										{#if service.completed}
											<StatusBadge status="approved" label="Completado" />
										{/if}
									</div>
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
										completed={service.completed}
									/>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</DataTable>
			</div>
		{/if}
	{/if}
</div>
