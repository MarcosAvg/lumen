<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Button } from '#lib/components/ui/button';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const typeLabel = {
		service: 'Servicio',
		work: 'Trabajo',
		element: 'Elemento'
	} as const;
</script>

<svelte:head>
	<title>Buscar · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Buscar</h1>
		<p class="text-sm text-muted-foreground">
			Solo se muestran servicios, trabajos y elementos dentro de tu ámbito autorizado.
		</p>
	</div>

	<form method="GET" action={resolve('/(app)/search')} class="flex gap-2">
		<Input name="q" value={data.q} placeholder="Nombre de servicio, trabajo o elemento" autofocus />
		<Button type="submit">Buscar</Button>
	</form>

	{#if data.q.trim().length === 0}
		<p class="text-sm text-muted-foreground">Escribe un término para buscar.</p>
	{:else if data.results.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-sm text-muted-foreground">
				Sin resultados para «{data.q}».
			</Card.Content>
		</Card.Root>
	{:else}
		<ul class="space-y-2">
			{#each data.results as result (result.type + result.id)}
				<li>
					<Card.Root>
						<Card.Content class="flex items-center justify-between gap-3 py-3">
							<div class="min-w-0">
								<p class="truncate font-medium">{result.label}</p>
								<p class="truncate text-sm text-muted-foreground">
									{typeLabel[result.type]}{#if result.context}
										· {result.context}{/if}
								</p>
							</div>
							<Button href={result.href} variant="outline" size="sm">Abrir</Button>
						</Card.Content>
					</Card.Root>
				</li>
			{/each}
		</ul>
	{/if}
</div>
