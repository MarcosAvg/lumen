<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Label } from '#lib/components/ui/label';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import type { PageProps } from './$types';
	import { NativeSelect } from '#lib/components/ui/native-select';

	type ActionData = { success?: string; message?: string };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	const assignmentLabel = { technician: 'Técnico', supervisor: 'Supervisor' } as const;
</script>

<svelte:head>
	<title>{data.service.name} · Asignaciones · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">{data.service.name}</h1>
			{#if data.service.description}
				<p class="text-sm text-muted-foreground">{data.service.description}</p>
			{/if}
		</div>
		<Button
			href={resolve('/(app)/services/[serviceId]', { serviceId: data.service.id })}
			variant="outline"
			size="sm">Ver servicio</Button
		>
	</div>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		<Card.Root>
			<Card.Header><Card.Title class="text-base">Asignar técnico</Card.Title></Card.Header>
			<Card.Content>
				<form method="POST" action="?/assign" class="space-y-3">
					<input type="hidden" name="serviceId" value={data.service.id} />
					<input type="hidden" name="role" value="technician" />
					<div class="space-y-2">
						<Label for="technician">Técnico</Label>
						<NativeSelect
							id="technician"
							name="userId"
							required
							disabled={data.technicians.length === 0}
						>
							{#each data.technicians as user (user.id)}
								<option value={user.id}>{user.displayName}</option>
							{:else}
								<option value="">Sin técnicos disponibles</option>
							{/each}
						</NativeSelect>
					</div>
					<Button type="submit" size="sm" disabled={data.technicians.length === 0}>Asignar</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header><Card.Title class="text-base">Asignar supervisor</Card.Title></Card.Header>
			<Card.Content>
				<form method="POST" action="?/assign" class="space-y-3">
					<input type="hidden" name="serviceId" value={data.service.id} />
					<input type="hidden" name="role" value="supervisor" />
					<div class="space-y-2">
						<Label for="supervisor">Supervisor</Label>
						<NativeSelect
							id="supervisor"
							name="userId"
							required
							disabled={data.supervisors.length === 0}
						>
							{#each data.supervisors as user (user.id)}
								<option value={user.id}>{user.displayName}</option>
							{:else}
								<option value="">Sin supervisores disponibles</option>
							{/each}
						</NativeSelect>
					</div>
					<Button type="submit" size="sm" disabled={data.supervisors.length === 0}>Asignar</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Participantes</Card.Title></Card.Header>
		<Card.Content>
			{#if data.assignments.length === 0}
				<p class="text-sm text-muted-foreground">Sin participantes asignados.</p>
			{:else}
				<ul class="divide-y">
					{#each data.assignments as assignment (assignment.id)}
						<li class="flex items-center justify-between gap-3 py-2">
							<span class="flex items-center gap-2 text-sm">
								{assignment.displayName}
								<Badge variant="secondary">{assignmentLabel[assignment.assignmentRole]}</Badge>
							</span>
							<form method="POST" action="?/revoke">
								<input type="hidden" name="assignmentId" value={assignment.id} />
								<Button type="submit" variant="destructive" size="sm">Revocar</Button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Zona de peligro</Card.Title></Card.Header>
		<Card.Content class="space-y-2">
			<p class="text-sm text-muted-foreground">
				Eliminar el servicio borra de forma permanente sus trabajos, elementos, evidencia, entregas
				y asignaciones.
			</p>
			<DestructiveDelete
				label="Eliminar servicio"
				endpoint={`/api/services/${data.service.id}`}
				itemName={data.service.name}
				onDeleted={() => {
					void goto(resolve('/(app)/admin/services'));
				}}
			/>
		</Card.Content>
	</Card.Root>
</div>
