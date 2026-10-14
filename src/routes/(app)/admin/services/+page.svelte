<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import type { PageProps } from './$types';

	type ActionData = {
		success?: string;
		message?: string;
		createErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let createOpen = $state(false);
	$effect(() => {
		if (action?.success) createOpen = false;
	});
</script>

<svelte:head>
	<title>Servicios · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Servicios"
		description="Administra los servicios, sus participantes y su estructura de trabajos y elementos."
	>
		<Button onclick={() => (createOpen = true)}>Nuevo servicio</Button>
	</PageHeader>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<Dialog.Root bind:open={createOpen}>
		<Dialog.Content>
			<form method="POST" action="?/create" class="space-y-4">
				<Dialog.Header>
					<Dialog.Title>Nuevo servicio</Dialog.Title>
					<Dialog.Description>
						Podrás añadir trabajos, elementos y participantes después.
					</Dialog.Description>
				</Dialog.Header>
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
				<Dialog.Footer>
					<Dialog.Close>Cancelar</Dialog.Close>
					<Button type="submit">Crear servicio</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	{#if data.services.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-sm text-muted-foreground">
				Aún no hay servicios. Crea el primero con «Nuevo servicio».
			</Card.Content>
		</Card.Root>
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2">
			{#each data.services as service (service.id)}
				<li>
					<Card.Root class="h-full">
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
								Asignaciones
							</Button>
							<Button
								href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
								variant="ghost"
								size="sm">Ver servicio</Button
							>
							<DestructiveDelete
								label="Eliminar"
								endpoint={`/api/services/${service.id}`}
								itemName={service.name}
								description="Se eliminarán sus trabajos, elementos, entregas y fotos."
							/>
						</Card.Footer>
					</Card.Root>
				</li>
			{/each}
		</ul>
	{/if}
</div>
