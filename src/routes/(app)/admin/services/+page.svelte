<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import * as Table from '#lib/components/ui/table';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
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
		<Alert role="status">
			<AlertDescription>{action.success}</AlertDescription>
		</Alert>
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
		<EmptyState title="Aún no hay servicios" description="Crea el primero con «Nuevo servicio»." />
	{:else}
		<ul class="space-y-3 md:hidden">
			{#each data.services as service (service.id)}
				<li class="relative">
					<Card.Root class="transition-colors active:bg-muted/50">
						<Card.Content class="space-y-3">
							<div>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a
									class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
									href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
								>
									{service.name}
								</a>
								{#if service.description}
									<p class="text-sm text-muted-foreground">{service.description}</p>
								{/if}
							</div>
							<div class="relative z-10 flex flex-wrap items-center gap-2">
								<Button
									href={resolve('/(app)/admin/services/[serviceId]', { serviceId: service.id })}
									variant="outline"
									size="sm"
								>
									Asignaciones
								</Button>
								<DestructiveDelete
									label="Eliminar"
									endpoint={`/api/services/${service.id}`}
									itemName={service.name}
									description="Se eliminarán sus trabajos, elementos, entregas y fotos."
								/>
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
						<Table.Head class="hidden lg:table-cell">Edificio</Table.Head>
						<Table.Head class="w-px text-right">Acciones</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.services as service (service.id)}
						<Table.Row class="relative">
							<Table.Cell class="whitespace-normal">
								<a
									class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
									href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
								>
									{service.name}
								</a>
								{#if service.description}
									<p class="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
										{service.description}
									</p>
								{/if}
							</Table.Cell>
							<Table.Cell class="hidden text-muted-foreground lg:table-cell">
								{service.buildingName ?? '—'}
							</Table.Cell>
							<Table.Cell class="relative z-10 text-right">
								<div class="flex items-center justify-end gap-2">
									<Button
										href={resolve('/(app)/admin/services/[serviceId]', { serviceId: service.id })}
										variant="outline"
										size="sm"
									>
										Asignaciones
									</Button>
									<DestructiveDelete
										label="Eliminar"
										endpoint={`/api/services/${service.id}`}
										itemName={service.name}
										description="Se eliminarán sus trabajos, elementos, entregas y fotos."
									/>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</DataTable>
		</div>
	{/if}
</div>
