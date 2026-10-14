<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function formatDate(value: Date): string {
		return new Date(value).toLocaleString();
	}
</script>

<svelte:head>
	<title>Revisiones pendientes · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Revisiones pendientes</h1>
		<p class="text-sm text-muted-foreground">
			Entregas en revisión de los servicios que puedes revisar.
		</p>
	</div>

	{#if data.pending.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-sm text-muted-foreground">
				No hay entregas pendientes de revisión.
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
	{/if}
</div>
