<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

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
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Revisiones pendientes</h1>
		<p class="text-sm text-muted-foreground">
			Entregas en revisión de los servicios que puedes revisar ({data.total} en total).
		</p>
	</div>

	<Card.Root>
		<Card.Content class="pt-6">
			<form method="GET" action={resolve('/(app)/reviews')} class="grid gap-3 sm:grid-cols-5">
				<div class="space-y-1 sm:col-span-2">
					<Label for="q">Texto</Label>
					<Input
						id="q"
						name="q"
						value={data.filters.q}
						placeholder="Servicio, trabajo o elemento"
					/>
				</div>
				<div class="space-y-1 sm:col-span-2">
					<Label for="serviceId">Servicio</Label>
					<select
						id="serviceId"
						name="serviceId"
						class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
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
					<Label for="from">Desde</Label>
					<Input id="from" name="from" type="date" value={data.filters.from} />
				</div>
				<div class="space-y-1">
					<Label for="to">Hasta</Label>
					<Input id="to" name="to" type="date" value={data.filters.to} />
				</div>
				<div class="flex items-end gap-2 sm:col-span-5">
					<Button type="submit" size="sm">Filtrar</Button>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={resolve('/(app)/reviews')} class="text-sm text-muted-foreground underline"
						>Limpiar</a
					>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	{#if data.pending.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-sm text-muted-foreground">
				No hay entregas pendientes con estos filtros.
			</Card.Content>
		</Card.Root>
	{:else}
		<ul class="space-y-3">
			{#each data.pending as item (item.submissionId)}
				<li>
					<Card.Root>
						<Card.Content class="flex flex-wrap items-center justify-between gap-3 pt-6">
							<div>
								<p class="flex items-center gap-2 font-medium">
									{item.serviceName}
									<Badge variant="secondary">Entrega #{item.sequenceNo}</Badge>
								</p>
								<p class="text-sm text-muted-foreground">
									{item.workName}
									{#if item.label !== item.workName}
										· {item.label}
									{/if}
								</p>
								<p class="text-sm text-muted-foreground">
									{item.submittedByName ?? 'Autor desconocido'} · {formatDate(item.submittedAt)}
								</p>
							</div>
							<Button
								href={resolve('/(app)/submissions/[submissionId]', {
									submissionId: item.submissionId
								})}
								size="sm">Revisar</Button
							>
						</Card.Content>
					</Card.Root>
				</li>
			{/each}
		</ul>

		{#if totalPages > 1}
			<div class="flex items-center justify-between gap-3">
				<span class="text-sm text-muted-foreground">Página {data.page} de {totalPages}</span>
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
