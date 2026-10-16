<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { NativeSelect } from '#lib/components/ui/native-select';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import ExportDialog from '#lib/components/app/export-dialog.svelte';
	import type { PageProps } from './$types';

	type ActionData = { success?: string; message?: string };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	const roleLabel = { technician: 'Técnico', supervisor: 'Supervisor' } as const;
	const technicians = $derived(data.assignable.filter((user) => user.role === 'technician'));
	const supervisors = $derived(data.assignable.filter((user) => user.role === 'supervisor'));

	let editOpen = $state(false);
	let revokeTarget = $state<{ id: string; displayName: string } | null>(null);

	const submitEdit: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') editOpen = false;
		};
	const submitAssign: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ update }) => {
			await update({ reset: true });
		};
	const submitRevoke: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: true });
			if (result.type === 'success') revokeTarget = null;
		};
</script>

<svelte:head>
	<title>{data.contract.name} · Contrato · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<AppBreadcrumbs
		items={[{ label: 'Contratos', href: '/contracts' }, { label: data.contract.name }]}
	/>

	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			{#if data.contract.description}
				<p class="text-sm text-muted-foreground">{data.contract.description}</p>
			{/if}
		</div>
		{#if data.canManage || data.isAdmin}
			<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
				<ExportDialog href={`/api/contracts/${data.contract.id}/export.zip`} />
				{#if data.isAdmin}
					<Button variant="outline" size="sm" onclick={() => (editOpen = true)}
						>Editar contrato</Button
					>
					<form method="POST" action="?/deleteContract">
						<Button type="submit" variant="destructive" size="sm">Eliminar contrato</Button>
					</form>
				{/if}
			</div>
		{/if}
	</div>

	{#if action?.success}
		<Alert role="status"><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	{#if data.isAdmin}
		<Dialog.Root bind:open={editOpen}>
			<Dialog.Content>
				<form method="POST" action="?/updateContract" class="space-y-4" use:enhance={submitEdit}>
					<input type="hidden" name="contractId" value={data.contract.id} />
					<Dialog.Header>
						<Dialog.Title>Editar contrato</Dialog.Title>
						<Dialog.Description>Nombre y descripción del contrato.</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-2">
						<Label for="contract-name">Nombre</Label>
						<Input id="contract-name" name="name" value={data.contract.name} required />
					</div>
					<div class="space-y-2">
						<Label for="contract-description">Descripción</Label>
						<Input
							id="contract-description"
							name="description"
							value={data.contract.description ?? ''}
						/>
					</div>
					{#if action?.message}
						<p class="text-sm text-destructive">{action.message}</p>
					{/if}
					<Dialog.Footer>
						<Dialog.Close>Cancelar</Dialog.Close>
						<Button type="submit">Guardar cambios</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	{/if}

	<Card.Root>
		<Card.Header class="flex flex-wrap items-center justify-between gap-2">
			<Card.Title class="text-base">Participantes</Card.Title>
			<span class="text-sm text-muted-foreground">{data.assignments.length}</span>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.canManage}
				<div class="grid gap-3 sm:grid-cols-2">
					<form method="POST" action="?/assignMember" class="space-y-2" use:enhance={submitAssign}>
						<input type="hidden" name="contractId" value={data.contract.id} />
						<input type="hidden" name="role" value="technician" />
						<Label for="member-technician">Añadir técnico</Label>
						<div class="flex gap-2">
							<NativeSelect
								id="member-technician"
								name="userId"
								required
								disabled={technicians.length === 0}
							>
								{#each technicians as user (user.id)}
									<option value={user.id}>{user.displayName}</option>
								{:else}
									<option value="">Sin técnicos</option>
								{/each}
							</NativeSelect>
							<Button type="submit" size="sm" disabled={technicians.length === 0}>Añadir</Button>
						</div>
					</form>
					<form method="POST" action="?/assignMember" class="space-y-2" use:enhance={submitAssign}>
						<input type="hidden" name="contractId" value={data.contract.id} />
						<input type="hidden" name="role" value="supervisor" />
						<Label for="member-supervisor">Añadir supervisor</Label>
						<div class="flex gap-2">
							<NativeSelect
								id="member-supervisor"
								name="userId"
								required
								disabled={supervisors.length === 0}
							>
								{#each supervisors as user (user.id)}
									<option value={user.id}>{user.displayName}</option>
								{:else}
									<option value="">Sin supervisores</option>
								{/each}
							</NativeSelect>
							<Button type="submit" size="sm" disabled={supervisors.length === 0}>Añadir</Button>
						</div>
					</form>
				</div>
			{/if}

			{#if data.assignments.length === 0}
				<p class="text-sm text-muted-foreground">Sin participantes.</p>
			{:else}
				<ul class="divide-y overflow-hidden rounded-lg border">
					{#each data.assignments as assignment (assignment.id)}
						<li class="flex items-center justify-between gap-3 p-3 text-sm">
							<span class="flex items-center gap-2">
								{assignment.displayName}
								<Badge variant="secondary">{roleLabel[assignment.assignmentRole]}</Badge>
							</span>
							{#if data.canManage}
								<Button
									variant="destructive"
									size="sm"
									onclick={() =>
										(revokeTarget = { id: assignment.id, displayName: assignment.displayName })}
								>
									Revocar
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Servicios ({data.services.length})</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if data.services.length === 0}
				<p class="text-sm text-muted-foreground">Este contrato no tiene servicios todavía.</p>
			{:else}
				<ul class="divide-y overflow-hidden rounded-lg border">
					{#each data.services as service (service.id)}
						<li class="relative flex items-center justify-between gap-3 p-3">
							<a
								class="font-medium text-foreground after:absolute after:inset-0"
								href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
							>
								{service.name}
							</a>
							{#if service.buildingName}
								<span class="text-xs text-muted-foreground">{service.buildingName}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<AlertDialog.Root
	open={revokeTarget !== null}
	onOpenChange={(open) => {
		if (!open) revokeTarget = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title
				>¿Revocar a «{revokeTarget?.displayName ?? ''}» del contrato?</AlertDialog.Title
			>
			<AlertDialog.Description>
				Dejará de pertenecer al contrato y se revocarán sus asignaciones de servicio dentro de él.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<form method="POST" action="?/revokeMember" use:enhance={submitRevoke}>
				<input type="hidden" name="assignmentId" value={revokeTarget?.id ?? ''} />
				<Button type="submit" variant="destructive">Revocar del contrato</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
