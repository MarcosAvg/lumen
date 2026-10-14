<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import type { PageProps } from './$types';

	type ActionData = {
		success?: string;
		message?: string;
		createErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);
</script>

<svelte:head>
	<title>Servicios · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Servicios</h1>
			<p class="text-sm text-muted-foreground">
				Administra los servicios, sus participantes y su estructura de trabajos y elementos.
			</p>
		</div>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<Button href="/api/admin/exports/services.csv" variant="outline" size="sm">Exportar CSV</Button>
	</div>

	{#if action?.success}
		<Alert>
			<AlertDescription>{action.success}</AlertDescription>
		</Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive">
			<AlertDescription>{action.message}</AlertDescription>
		</Alert>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Nuevo servicio</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Nombre</Label>
					<Input id="name" name="name" required />
					{#if action?.createErrors?.name}
						<p class="text-sm text-destructive">{action.createErrors.name}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="description">Descripción (opcional)</Label>
					<Input id="description" name="description" />
				</div>
				<Button type="submit">Crear servicio</Button>
			</form>
		</Card.Content>
	</Card.Root>

	{#if data.services.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-sm text-muted-foreground">
				Aún no hay servicios.
			</Card.Content>
		</Card.Root>
	{:else}
		<ul class="space-y-3">
			{#each data.services as service (service.id)}
				<li>
					<Card.Root>
						<Card.Header>
							<Card.Title class="text-base">{service.name}</Card.Title>
							{#if service.description}
								<Card.Description>{service.description}</Card.Description>
							{/if}
						</Card.Header>
						<Card.Footer class="gap-2">
							<Button
								href={resolve('/(app)/admin/services/[serviceId]', { serviceId: service.id })}
								variant="outline"
								size="sm"
							>
								Asignaciones y participantes
							</Button>
							<Button
								href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
								variant="ghost"
								size="sm">Ver servicio</Button
							>
						</Card.Footer>
					</Card.Root>
				</li>
			{/each}
		</ul>
	{/if}
</div>
