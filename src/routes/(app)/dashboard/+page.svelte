<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Table from '#lib/components/ui/table';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import ProgressMeter from '#lib/components/app/progress-meter.svelte';
	import type { AttentionTarget } from '#lib/server/domain/dashboard';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const role = $derived(data.user.role);
	const approvedPercent = $derived(
		data.summary.totalTargets === 0
			? 0
			: Math.round((data.summary.approvedTargets / data.summary.totalTargets) * 100)
	);
	const rejected = $derived(data.attention.filter((target) => target.status === 'rejected'));
	const inProgress = $derived(data.attention.filter((target) => target.status !== 'rejected'));

	function hrefFor(target: AttentionTarget): string {
		if (target.type === 'element')
			return resolve('/(app)/elements/[elementId]', { elementId: target.id });
		return resolve('/(app)/works/[workId]', { workId: target.id });
	}
</script>

<svelte:head>
	<title>Inicio · Lumen</title>
</svelte:head>

{#snippet targetList(targets: AttentionTarget[])}
	<ul class="divide-y overflow-hidden rounded-lg border">
		{#each targets as target (target.targetId)}
			<li class="relative flex items-start justify-between gap-3 p-3 active:bg-muted/50">
				<div class="space-y-0.5">
					<p class="flex flex-wrap items-center gap-2">
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							class="font-medium text-foreground after:absolute after:inset-0"
							href={hrefFor(target)}
						>
							{target.label}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<StatusBadge status={target.status} />
					</p>
					<p class="text-xs text-muted-foreground">{target.serviceName} · {target.workName}</p>
					{#if target.status === 'rejected' && target.rejectionReason}
						<p class="text-sm">Motivo: {target.rejectionReason}</p>
					{:else if target.requiredCount > 0}
						<p class="tnum text-sm text-muted-foreground">
							{target.satisfiedCount}/{target.requiredCount} requisitos
						</p>
					{:else}
						<p class="tnum text-sm text-muted-foreground">{target.readyPhotoCount} foto(s)</p>
					{/if}
				</div>
				<span class="relative z-10 shrink-0 pt-0.5 text-sm font-medium text-primary">
					{target.status === 'rejected' ? 'Corregir' : 'Continuar'} →
				</span>
			</li>
		{/each}
	</ul>
{/snippet}

<div class="space-y-6">
	<PageHeader
		title="Hola, {data.user.displayName}"
		description={role === 'technician'
			? 'Tu evidencia pendiente y los servicios asignados.'
			: role === 'supervisor'
				? 'Entregas por revisar y servicios asignados.'
				: 'Resumen global y servicios.'}
	></PageHeader>

	{#if role === 'technician'}
		{#if rejected.length > 0}
			<section class="space-y-2">
				<h2 class="text-sm font-medium">Requiere tu atención</h2>
				{@render targetList(rejected)}
			</section>
		{/if}
		{#if inProgress.length > 0}
			<section class="space-y-2">
				<h2 class="text-sm font-medium">Pendientes</h2>
				{@render targetList(inProgress)}
			</section>
		{/if}
		{#if data.attention.length === 0}
			<p class="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
				No tienes evidencia pendiente. Buen trabajo.
			</p>
		{/if}
	{:else}
		<div class="grid gap-3 sm:grid-cols-3">
			<Card.Root>
				<Card.Content>
					<p class="text-sm text-muted-foreground">
						{role === 'admin' ? 'Servicios' : 'Servicios asignados'}
					</p>
					<p class="tnum text-2xl font-semibold">{data.summary.serviceCount}</p>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="space-y-2">
					<p class="text-sm text-muted-foreground">Objetivos aprobados</p>
					<ProgressMeter
						approved={data.summary.approvedTargets}
						total={data.summary.totalTargets}
						percent={approvedPercent}
						completed={data.summary.totalTargets > 0 &&
							data.summary.approvedTargets === data.summary.totalTargets}
					/>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content>
					<p class="text-sm text-muted-foreground">Revisiones pendientes</p>
					<p class="tnum text-2xl font-semibold">{data.summary.pendingReviews}</p>
				</Card.Content>
			</Card.Root>
		</div>

		<section class="space-y-2">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm font-medium">Entregas por revisar</h2>
				{#if data.pendingTotal > 0}
					<Button href={resolve('/(app)/reviews')} variant="ghost" size="sm">Ver todas</Button>
				{/if}
			</div>
			{#if data.pending.length === 0}
				<EmptyState
					title="Sin revisiones pendientes"
					description="Cuando los técnicos envíen evidencia, aparecerá aquí."
				/>
			{:else}
				<ul class="divide-y overflow-hidden rounded-lg border">
					{#each data.pending as item (item.submissionId)}
						<li class="relative flex items-center justify-between gap-3 p-3 active:bg-muted/50">
							<div class="space-y-0.5">
								<a
									class="font-medium text-foreground after:absolute after:inset-0"
									href={resolve('/(app)/submissions/[submissionId]', {
										submissionId: item.submissionId
									})}
								>
									{item.label}
								</a>
								<p class="text-xs text-muted-foreground">
									{item.serviceName} · {item.workName} · #{item.sequenceNo} ·
									{item.submittedByName ?? 'Autor desconocido'}
								</p>
							</div>
							<StatusBadge status="in_review" />
						</li>
					{/each}
				</ul>
				{#if data.pendingTotal > data.pending.length}
					<Button href={resolve('/(app)/reviews')} variant="outline" size="sm">
						Ver las {data.pendingTotal} pendientes
					</Button>
				{/if}
			{/if}
		</section>
	{/if}

	<section class="space-y-2">
		<h2 class="text-sm font-medium">Servicios</h2>
		{#if data.services.length === 0}
			<EmptyState
				title="Aún no hay servicios"
				description={role === 'admin'
					? 'Crea el primer servicio para empezar a estructurar trabajos y evidencia.'
					: 'No tienes servicios asignados. Contacta con un administrador.'}
			>
				{#if role === 'admin'}
					<Button href={resolve('/(app)/admin/services')} size="sm">Ir a Servicios</Button>
				{/if}
			</EmptyState>
		{:else}
			<ul class="space-y-3 md:hidden">
				{#each data.services as service (service.id)}
					<li class="relative">
						<Card.Root class="transition-colors active:bg-muted/50">
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
							</Table.Row>
						{/each}
					</Table.Body>
				</DataTable>
			</div>
		{/if}
	</section>
</div>
