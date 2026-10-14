<script lang="ts">
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import type { Role } from '#lib/types';
	import type { PageProps } from './$types';

	type RoleChangeConflict = {
		userId: string;
		role: Role;
		assignments: { id: string; serviceName: string; assignmentRole: string }[];
	};

	type ActionData = {
		success?: string;
		message?: string;
		details?: RoleChangeConflict | null;
		createErrors?: Record<string, string>;
		resetErrors?: Record<string, string>;
		profileErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();

	const action = $derived((form ?? null) as ActionData | null);
	const conflict = $derived(
		action?.details && typeof action.details === 'object' && 'userId' in action.details
			? action.details
			: null
	);

	interface EditTarget {
		id: string;
		username: string;
		displayName: string;
		role: Role;
	}
	let editOpen = $state(false);
	let editUser = $state<EditTarget | null>(null);
	let editRole = $state<Role>('technician');
	let editName = $state('');
	let editUsername = $state('');
	let editPending = $state(false);

	function openEdit(user: EditTarget) {
		editUser = user;
		editRole = user.role;
		editName = user.displayName;
		editUsername = user.username;
		editPending = false;
		editOpen = true;
	}

	// Envío progresivo desde el modal: mantiene los valores ante fallos y solo
	// cierra al confirmarse el éxito. Evita que un aviso previo cierre el modal.
	const submitEdit: NonNullable<Parameters<typeof enhance>[1]> = () => {
		editPending = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			editPending = false;
			if (result.type === 'success') {
				editOpen = false;
				editUser = null;
			}
		};
	};

	const roleLabel: Record<Role, string> = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	};
</script>

<svelte:head>
	<title>Usuarios · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Usuarios</h1>
		<p class="text-sm text-muted-foreground">Crea cuentas, cambia roles y controla el acceso.</p>
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
			<Card.Title class="text-base">Nuevo usuario</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-2">
					<Label for="new-displayName">Nombre visible</Label>
					<Input id="new-displayName" name="displayName" required />
					{#if action?.createErrors?.displayName}
						<p class="text-sm text-destructive">{action.createErrors.displayName}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="new-username">Usuario</Label>
					<Input id="new-username" name="username" autocomplete="off" required />
					{#if action?.createErrors?.username}
						<p class="text-sm text-destructive">{action.createErrors.username}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="new-password">Contraseña</Label>
					<Input
						id="new-password"
						name="password"
						type="password"
						autocomplete="new-password"
						required
					/>
					{#if action?.createErrors?.password}
						<p class="text-sm text-destructive">{action.createErrors.password}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="new-role">Rol</Label>
					<select
						id="new-role"
						name="role"
						class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						required
					>
						<option value="technician">Técnico</option>
						<option value="supervisor">Supervisor</option>
						<option value="admin">Administrador</option>
					</select>
				</div>
				<div class="sm:col-span-2">
					<Button type="submit">Crear usuario</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<ul class="space-y-3">
		{#each data.users as user (user.id)}
			<li>
				<Card.Root>
					<Card.Content class="flex flex-wrap items-center justify-between gap-4 pt-6">
						<div class="min-w-0">
							<p class="flex items-center gap-2 font-medium">
								{user.displayName}
								<Badge variant="secondary">{roleLabel[user.role]}</Badge>
								{#if !user.isActive}
									<Badge variant="destructive">Inactivo</Badge>
								{/if}
							</p>
							<p class="truncate text-sm text-muted-foreground">@{user.username}</p>
						</div>

						<div class="flex flex-wrap items-center gap-2">
							{#if user.isActive}
								<form method="POST" action="?/deactivate">
									<input type="hidden" name="userId" value={user.id} />
									<Button type="submit" variant="destructive" size="sm">Desactivar</Button>
								</form>
							{:else}
								<form method="POST" action="?/activate">
									<input type="hidden" name="userId" value={user.id} />
									<Button type="submit" variant="outline" size="sm">Activar</Button>
								</form>
							{/if}

							<Button variant="outline" size="sm" onclick={() => openEdit(user)}>Editar</Button>

							<DestructiveDelete
								label="Eliminar"
								endpoint={`/api/users/${user.id}`}
								itemName={user.displayName}
								description="Se elimina la cuenta; su nombre se conserva como firma en el historial (entregas, revisiones y fotos)."
							/>
						</div>
					</Card.Content>
				</Card.Root>
			</li>
		{/each}
	</ul>

	<Dialog.Root bind:open={editOpen}>
		<Dialog.Content class="max-h-[85vh] overflow-y-auto">
			<Dialog.Header>
				<Dialog.Title>Editar usuario</Dialog.Title>
				<Dialog.Description>
					{editUser?.displayName ?? ''} — el nuevo nombre se usa desde este momento; el historial conserva
					la firma original.
				</Dialog.Description>
			</Dialog.Header>

			{#if action?.message}
				<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
			{/if}

			<div class="space-y-5">
				<form method="POST" action="?/updateProfile" class="space-y-3" use:enhance={submitEdit}>
					<input type="hidden" name="userId" value={editUser?.id ?? ''} />
					<h3 class="text-sm font-medium">Datos</h3>
					<div class="space-y-2">
						<Label for="edit-displayName">Nombre visible</Label>
						<Input id="edit-displayName" name="displayName" bind:value={editName} required />
						{#if action?.profileErrors?.displayName}
							<p class="text-sm text-destructive">{action.profileErrors.displayName}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="edit-username">Usuario</Label>
						<Input
							id="edit-username"
							name="username"
							bind:value={editUsername}
							autocomplete="off"
							required
						/>
						{#if action?.profileErrors?.username}
							<p class="text-sm text-destructive">{action.profileErrors.username}</p>
						{/if}
					</div>
					<Button type="submit" size="sm" disabled={editPending}>Guardar datos</Button>
				</form>

				<form
					method="POST"
					action="?/changeRole"
					class="space-y-3 border-t pt-4"
					use:enhance={submitEdit}
				>
					<input type="hidden" name="userId" value={editUser?.id ?? ''} />
					<h3 class="text-sm font-medium">Rol</h3>
					<div class="space-y-2">
						<Label for="edit-role">Rol global</Label>
						<select
							id="edit-role"
							name="role"
							bind:value={editRole}
							class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						>
							<option value="technician">Técnico</option>
							<option value="supervisor">Supervisor</option>
							<option value="admin">Administrador</option>
						</select>
					</div>
					<Button type="submit" variant="outline" size="sm" disabled={editPending}
						>Cambiar rol</Button
					>

					{#if conflict}
						<Alert variant="destructive">
							<AlertDescription>
								<p class="mb-2">Al cambiar el rol se revocarán estas asignaciones incompatibles:</p>
								<ul class="list-inside list-disc">
									{#each conflict.assignments as assignment (assignment.id)}
										<li>{assignment.serviceName} · {assignment.assignmentRole}</li>
									{/each}
								</ul>
							</AlertDescription>
						</Alert>
						<Button
							type="submit"
							name="confirmRevoke"
							value="true"
							variant="destructive"
							size="sm"
							disabled={editPending}>Confirmar y revocar asignaciones</Button
						>
					{/if}
				</form>

				<form
					method="POST"
					action="?/resetPassword"
					class="space-y-3 border-t pt-4"
					use:enhance={submitEdit}
				>
					<input type="hidden" name="userId" value={editUser?.id ?? ''} />
					<h3 class="text-sm font-medium">Contraseña</h3>
					<div class="space-y-2">
						<Label for="edit-password">Nueva contraseña</Label>
						<Input
							id="edit-password"
							name="password"
							type="password"
							autocomplete="new-password"
							required
						/>
						{#if action?.resetErrors?.password}
							<p class="text-sm text-destructive">{action.resetErrors.password}</p>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground">Al restablecerla se cierran sus sesiones.</p>
					<Button type="submit" variant="outline" size="sm" disabled={editPending}>
						Restablecer contraseña
					</Button>
				</form>
			</div>

			<Dialog.Footer>
				<Dialog.Close>Cancelar</Dialog.Close>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
</div>
