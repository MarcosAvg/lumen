<script lang="ts">
	import { resolve } from '$app/paths';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import * as Table from '#lib/components/ui/table';
	import PageIntro from '#lib/components/app/page-intro.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import { formatRelativeAge } from '#lib/utils';
	import type { PageProps } from './$types';
	import { NativeSelect } from '#lib/components/ui/native-select';

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
	<PageIntro
		description="Entregas en revisión de los servicios que puedes revisar ({data.total} en total)."
	/>

	<form
		method="GET"
		action={resolve('/(app)/reviews')}
		class="flex flex-col gap-3 py-4 lg:flex-row lg:items-end"
	>
		<div class="flex-1 space-y-1">
			<Label for="q" class="text-xs">Texto</Label>
			<Input id="q" name="q" value={data.filters.q} placeholder="Servicio, trabajo o elemento" />
		</div>
		<div class="space-y-1 lg:w-56">
			<Label for="serviceId" class="text-xs">Servicio</Label>
			<NativeSelect id="serviceId" name="serviceId">
				<option value="">Todos</option>
				{#each data.services as service (service.id)}
					<option value={service.id} selected={data.filters.serviceId === service.id}
						>{service.name}</option
					>
				{/each}
			</NativeSelect>
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
			<Button type="submit">Filtrar</Button>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={resolve('/(app)/reviews')} class="text-sm text-muted-foreground underline">Limpiar</a
			>
		</div>
	</form>

	{#if data.pending.length === 0}
		<EmptyState
			Icon={ClipboardCheck}
			tone="approved"
			title="No hay entregas pendientes"
			description="No hay entregas en revisión con estos filtros."
		/>
	{:else}
		<ul class="space-y-3 md:hidden">
			{#each data.pending as item (item.submissionId)}
				{@const stale = now - new Date(item.submittedAt).getTime() > STALE_MS}
				<li class="relative">
					<Card.Root
						class="border-l-2 transition-colors active:bg-muted/50 {stale
							? 'border-l-state-attention'
							: 'border-l-state-pending/60'}"
					>
						<Card.Content class="space-y-2">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="text-sm text-muted-foreground">{item.serviceName}</p>
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a
										class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
										href={resolve('/(app)/submissions/[submissionId]', {
											submissionId: item.submissionId
										})}
									>
										{item.workName}
										{#if item.label !== item.workName}
											<span> · {item.label}</span>
										{/if}
									</a>
								</div>
								<span class="tnum shrink-0 text-xs text-muted-foreground">#{item.sequenceNo}</span>
							</div>
							<div class="flex items-center justify-between gap-2 text-xs">
								<span class="text-muted-foreground">
									{item.submittedByName ?? 'Autor desconocido'}
								</span>
								<span
									class={stale ? 'font-medium text-state-attention' : 'text-muted-foreground'}
									title={formatDate(item.submittedAt)}
								>
									{formatRelativeAge(item.submittedAt, now)}
								</span>
							</div>
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
						<Table.Head>Objetivo</Table.Head>
						<Table.Head class="hidden lg:table-cell">Autor</Table.Head>
						<Table.Head class="hidden lg:table-cell">Enviada</Table.Head>
						<Table.Head class="hidden lg:table-cell">Antigüedad</Table.Head>
						<Table.Head class="w-px text-right">Nº</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.pending as item (item.submissionId)}
						{@const stale = now - new Date(item.submittedAt).getTime() > STALE_MS}
						<Table.Row class="relative">
							<Table.Cell class="whitespace-normal text-muted-foreground">
								{item.serviceName}
							</Table.Cell>
							<Table.Cell class="whitespace-normal">
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a
									class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
									href={resolve('/(app)/submissions/[submissionId]', {
										submissionId: item.submissionId
									})}
								>
									{item.workName}
									{#if item.label !== item.workName}
										<span> · {item.label}</span>
									{/if}
								</a>
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
										<span class="size-1.5 rounded-full bg-state-attention" aria-hidden="true"
										></span>
									{/if}
									{formatRelativeAge(item.submittedAt, now)}
								</span>
							</Table.Cell>
							<Table.Cell class="tnum text-right font-medium text-muted-foreground">
								{item.sequenceNo}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</DataTable>
		</div>

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
