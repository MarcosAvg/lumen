<script lang="ts">
	import { Badge } from '#lib/components/ui/badge';
	import * as Card from '#lib/components/ui/card';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const accessLabel = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	} as const;

	const participantLabel = { technician: 'Técnico', supervisor: 'Supervisor' } as const;
</script>

<svelte:head>
	<title>{data.service.name} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">{data.service.name}</h1>
		{#if data.service.description}
			<p class="text-sm text-muted-foreground">{data.service.description}</p>
		{/if}
		<p class="mt-2">
			<Badge variant="secondary">Tu acceso: {accessLabel[data.access]}</Badge>
		</p>
	</div>

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Participantes</Card.Title></Card.Header>
		<Card.Content>
			{#if data.participants.length === 0}
				<p class="text-sm text-muted-foreground">Sin participantes asignados.</p>
			{:else}
				<ul class="divide-y">
					{#each data.participants as participant (participant.userId + participant.assignmentRole)}
						<li class="flex items-center justify-between gap-3 py-2 text-sm">
							<span>{participant.displayName}</span>
							<Badge variant="secondary">{participantLabel[participant.assignmentRole]}</Badge>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content class="py-6 text-center text-sm text-muted-foreground">
			Los trabajos, elementos y la captura de evidencia llegan en las siguientes etapas.
		</Card.Content>
	</Card.Root>
</div>
