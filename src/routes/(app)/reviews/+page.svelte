<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import * as Table from '#lib/components/ui/table';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import { formatRelativeAge } from '#lib/utils';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const now = Date.now();
	const STALE_MS = 24 * 60 * 60 * 1000;

	function formatDate(value: Date): string {
		return new Date(value).toLocaleString();
	}

	function query(overrides: Record<string, string | number>): string {
		const params = new SvelteURLSearchParams();
		const merged = {
			serviceId: data.filters.serviceId,
			from: data.filters.from,
			to: data.filters.to,
			q: data.filters.q,
			...overrides
		};
		for (const [key, value] of Object.entries(merged)) {
			if (value !== '' && value !== undefined && value !== null) params.set(key, String(value));
		}
		const qs = params.toString();
		return qs ? `?${qs}` : '';
	}

	const totalPages = $derived(Math.max(Math.ceil(data.total / data.pageSize), 1));
</script>

<svelte:head>
	<title>Revisiones pendientes · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Revisiones"
		description="Entregas en revisión de los servicios que puedes revisar ({data.total} en total)."
	/>

	<form
		method="GET"
		action={resolve('/(app)/reviews')}
		class="flex flex-col gap-3 border-y py-4 lg:flex-row lg:items-end"
	>
		<div class="flex-1 space-y-1">
			<Label for="q" class="text-xs">Texto</Label>
			<Input id="q" name="q" value={data.filters.q} placeholder="Servicio, trabajo o elemento" />
		</div>
		<div class="space-y-1 lg:w-56">
			<Label for="serviceId" class="text-xs">Servicio</Label>
			<select
				id="serviceId"
				name="serviceId"
				class="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
			>
				<option value="">Todos</option>
				{#each data.services as service (service.id)}
					<option value={service.id} selected={data.filters.serviceId === service.id}
						>{service.name}</option
					>
				{/each}
			</select>
		</div>
		<div class="space-y-1">
			<Label for="from" class="text-xs">Desde</Label>
			<Input id="from" name="from" type="date" value={data.filters.from} />
		</div>
		<div class="space-y-1">
			<Label for="to" class="text-xs">Hasta</Label>
			<Input id="to" name="to" type="date" value={data.filters.to} />
		</div>
		<div class="flex items-center gap-2 pb-0.5">
			<Button type="submit" size="sm">Filtrar</Button>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={resolve('/(app)/reviews')} class="text-sm text-muted-foreground underline">Limpiar</a
			>
		</div>
	</form>

	{#if data.pending.length === 0}
		<EmptyState
			title="No hay entregas pendientes"
			description="No hay entregas en revisión con estos filtros."
		/>
	{:else}
		<DataTable>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-px text-right">#</Table.Head>
					<Table.Head>Servicio</Table.Head>
					<Table.Head>Objetivo</Table.Head>
					<Table.Head class="hidden lg:table-cell">Autor</Table.Head>
					<Table.Head class="hidden lg:table-cell">Enviada</Table.Head>
					<Table.Head class="hidden lg:table-cell">Antigüedad</Table.Head>
					<Table.Head class="w-px text-right">Acciones</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.pending as item (item.submissionId)}
					{@const stale = now - new Date(item.submittedAt).getTime() > STALE_MS}
					<Table.Row>
						<Table.Cell class="tnum text-right font-medium text-muted-foreground">
							{item.sequenceNo}
						</Table.Cell>
						<Table.Cell class="whitespace-normal">
							<a
								class="font-medium text-foreground underline-offset-4 hover:underline"
								href={resolve('/(app)/services/[serviceId]', { serviceId: item.serviceId })}
							>
								{item.serviceName}
							</a>
						</Table.Cell>
						<Table.Cell class="whitespace-normal text-muted-foreground">
							{item.workName}
							{#if item.label !== item.workName}
								<span> · {item.label}</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="hidden text-muted-foreground lg:table-cell">
							{item.submittedByName ?? 'Autor desconocido'}
						</Table.Cell>
						<Table.Cell class="tnum hidden text-muted-foreground lg:table-cell">
							{formatDate(item.submittedAt)}
						</Table.Cell>
						<Table.Cell class="hidden lg:table-cell">
							<span
								class="inline-flex items-center gap-1.5 text-sm {stale
									? 'font-medium text-state-attention'
									: 'text-muted-foreground'}"
								title={formatDate(item.submittedAt)}
							>
								{#if stale}
									<span class="size-1.5 rounded-full bg-state-attention" aria-hidden="true"></span>
								{/if}
								{formatRelativeAge(item.submittedAt, now)}
							</span>
						</Table.Cell>
						<Table.Cell class="text-right">
							<Button
								href={resolve('/(app)/submissions/[submissionId]', {
									submissionId: item.submissionId
								})}
								size="sm">Revisar</Button
							>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</DataTable>

		{#if totalPages > 1}
			<div class="flex items-center justify-between gap-3">
				<span class="tnum text-sm text-muted-foreground">Página {data.page} de {totalPages}</span>
				<div class="flex gap-2">
					{#if data.page > 1}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<Button href={query({ page: data.page - 1 })} variant="outline" size="sm"
							>Anterior</Button
						>
					{/if}
					{#if data.page < totalPages}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<Button href={query({ page: data.page + 1 })} variant="outline" size="sm"
							>Siguiente</Button
						>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>
