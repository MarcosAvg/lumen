<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import * as Table from '#lib/components/ui/table';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const typeLabel = {
		service: 'Servicios',
		work: 'Trabajos',
		element: 'Elementos'
	} as const;

	type ResultType = keyof typeof typeLabel;

	function hrefFor(result: { type: string; id: string }): string {
		if (result.type === 'work') return resolve('/(app)/works/[workId]', { workId: result.id });
		if (result.type === 'element')
			return resolve('/(app)/elements/[elementId]', { elementId: result.id });
		return resolve('/(app)/services/[serviceId]', { serviceId: result.id });
	}

	const grouped = $derived.by(() => {
		const order: ResultType[] = ['service', 'work', 'element'];
		return order
			.map((type) => ({
				type,
				label: typeLabel[type],
				items: data.results.filter((result) => result.type === type)
			}))
			.filter((group) => group.items.length > 0);
	});
</script>

<svelte:head>
	<title>Buscar · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Buscar"
		description="Solo se muestran servicios, trabajos y elementos dentro de tu ámbito autorizado."
	/>

	<form
		method="GET"
		action={resolve('/(app)/search')}
		class="flex items-center gap-2 border-y py-4"
	>
		<Input
			name="q"
			value={data.q}
			placeholder="Nombre de servicio, trabajo o elemento"
			autofocus
			class="max-w-xl"
		/>
		<Button type="submit">Buscar</Button>
	</form>

	{#if data.q.trim().length === 0}
		<EmptyState
			title="Escribe un término para buscar"
			description="Servicios, trabajos y elementos de tu ámbito."
		/>
	{:else if data.results.length === 0}
		<EmptyState title="Sin resultados" description="Nada coincide con «{data.q}»." />
	{:else}
		{#each grouped as group (group.type)}
			<section class="space-y-2">
				<h2 class="tnum text-sm font-medium text-muted-foreground">
					{group.label} ({group.items.length})
				</h2>

				<ul class="space-y-3 md:hidden">
					{#each group.items as result (result.type + result.id)}
						<li class="relative">
							<Card.Root class="transition-colors active:bg-muted/50">
								<Card.Content>
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
										href={hrefFor(result)}>{result.label}</a
									>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{#if result.context}
										<p class="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
											{result.context}
										</p>
									{/if}
								</Card.Content>
							</Card.Root>
						</li>
					{/each}
				</ul>

				<div class="hidden md:block">
					<DataTable>
						<Table.Body>
							{#each group.items as result (result.type + result.id)}
								<Table.Row class="relative">
									<Table.Cell class="whitespace-normal">
										<!-- eslint-disable svelte/no-navigation-without-resolve -->
										<a
											class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
											href={hrefFor(result)}>{result.label}</a
										>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									</Table.Cell>
									<Table.Cell class="hidden whitespace-normal text-muted-foreground lg:table-cell">
										{result.context || '—'}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</DataTable>
				</div>
			</section>
		{/each}
	{/if}
</div>
