<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card';
	import { Button } from '#lib/components/ui/button';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Inicio · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Hola, {data.user.displayName}</h1>
		<p class="text-sm text-muted-foreground">Servicios a los que tienes acceso.</p>
	</div>

	{#if data.services.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-sm text-muted-foreground">
				{#if data.user.role === 'admin'}
					Aún no hay servicios. Créalos desde <a
						class="underline"
						href={resolve('/(app)/admin/services')}>Servicios</a
					>.
				{:else}
					No tienes servicios asignados. Contacta con un administrador.
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2">
			{#each data.services as service (service.id)}
				<li>
					<Card.Root>
						<Card.Header>
							<Card.Title class="text-base">{service.name}</Card.Title>
							{#if service.description}
								<Card.Description>{service.description}</Card.Description>
							{/if}
						</Card.Header>
						<Card.Footer>
							<Button
								href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
								variant="outline"
								size="sm"
							>
								Abrir servicio
							</Button>
						</Card.Footer>
					</Card.Root>
				</li>
			{/each}
		</ul>
	{/if}
</div>
