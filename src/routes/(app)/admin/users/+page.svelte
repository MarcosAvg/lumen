<script lang="ts">
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import * as Table from '#lib/components/ui/table';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
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

	type EnhanceSubmit = NonNullable<Parameters<typeof enhance>[1]>;

	// Identifica el modal que envió la última acción para no mezclar sus avisos.
	let activeForm = $state<'create' | 'edit' | null>(null);

	let createOpen = $state(false);
	let createName = $state('');
	let createUsername = $state('');
	let createPassword = $state('');
	let createRole = $state<Role>('technician');
	let createPending = $state(false);

	function openCreate() {
		createName = '';
		createUsername = '';
		createPassword = '';
		createRole = 'technician';
		createPending = false;
		activeForm = null;
		createOpen = true;
	}

	// Envío progresivo: mantiene los valores ante fallos y solo cierra al confirmar éxito.
	const submitCreate: EnhanceSubmit = () => {
		createPending = true;
		activeForm = 'create';
		return async ({ result, update }) => {
			await update({ reset: false });
			createPending = false;
			if (result.type === 'success') createOpen = false;
		};
	};

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
		activeForm = null;
		editOpen = true;
	}

	// Envío progresivo desde el modal: mantiene los valores ante fallos y solo
	// cierra al confirmarse el éxito. Evita que un aviso previo cierre el modal.
	const submitEdit: EnhanceSubmit = () => {
		editPending = true;
		activeForm = 'edit';
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
	<PageHeader title="Usuarios" description="Crea cuentas, cambia roles y controla el acceso.">
		<Button onclick={openCreate}>Nuevo usuario</Button>
	</PageHeader>

	{#if action?.success}
		<Alert>
			<AlertDescription>{action.success}</AlertDescription>
		</Alert>
	{/if}

	{#if action?.message && activeForm === null}
		<Alert variant="destructive">
			<AlertDescription>{action.message}</AlertDescription>
		</Alert>
	{/if}

	<Dialog.Root bind:open={createOpen}>
		<Dialog.Content>
			<form method="POST" action="?/create" class="space-y-4" use:enhance={submitCreate}>
				<Dialog.Header>
					<Dialog.Title>Nuevo usuario</Dialog.Title>
					<Dialog.Description>
						Indica el nombre visible, el usuario de acceso y su contraseña.
					</Dialog.Description>
				</Dialog.Header>

				{#if activeForm === 'create' && action?.message}
					<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
				{/if}

				<div class="space-y-2">
					<Label for="new-displayName">Nombre visible</Label>
					<Input id="new-displayName" name="displayName" bind:value={createName} required />
					{#if action?.createErrors?.displayName}
						<p class="text-sm text-destructive">{action.createErrors.displayName}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="new-username">Usuario</Label>
					<Input
						id="new-username"
						name="username"
						bind:value={createUsername}
						autocomplete="off"
						required
					/>
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
						bind:value={createPassword}
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
						bind:value={createRole}
						class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						required
					>
						<option value="technician">Técnico</option>
						<option value="supervisor">Supervisor</option>
						<option value="admin">Administrador</option>
					</select>
				</div>

				<Dialog.Footer>
					<Dialog.Close>Cancelar</Dialog.Close>
					<Button type="submit" disabled={createPending}>Crear usuario</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<DataTable>
		<Table.Header>
			<Table.Row>
				<Table.Head>Usuario</Table.Head>
				<Table.Head>Rol</Table.Head>
				<Table.Head>Estado</Table.Head>
				<Table.Head class="w-px text-right">Acciones</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.users as user (user.id)}
				<Table.Row>
					<Table.Cell class="whitespace-normal">
						<div class="font-medium text-foreground">{user.displayName}</div>
						<p class="truncate text-sm text-muted-foreground">@{user.username}</p>
					</Table.Cell>
					<Table.Cell>
						<Badge variant="secondary">{roleLabel[user.role]}</Badge>
					</Table.Cell>
					<Table.Cell>
						{#if user.isActive}
							<span class="text-sm text-muted-foreground">Activo</span>
						{:else}
							<Badge variant="destructive">Inactivo</Badge>
						{/if}
					</Table.Cell>
					<Table.Cell class="text-right">
						<div class="flex items-center justify-end gap-2">
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
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</DataTable>

	<Dialog.Root bind:open={editOpen}>
		<Dialog.Content class="max-h-[85vh] overflow-y-auto">
			<Dialog.Header>
				<Dialog.Title>Editar usuario</Dialog.Title>
				<Dialog.Description>
					{editUser?.displayName ?? ''} — el nuevo nombre se usa desde este momento; el historial conserva
					la firma original.
				</Dialog.Description>
			</Dialog.Header>

			{#if activeForm === 'edit' && action?.message}
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
