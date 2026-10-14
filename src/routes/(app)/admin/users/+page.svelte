<script lang="ts">
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
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
	};

	let { data, form }: PageProps = $props();

	const action = $derived((form ?? null) as ActionData | null);
	const conflict = $derived(
		action?.details && typeof action.details === 'object' && 'userId' in action.details
			? action.details
			: null
	);

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

	{#if conflict}
		<Alert variant="destructive">
			<AlertDescription>
				<p class="mb-2">Al cambiar el rol se revocarán estas asignaciones incompatibles:</p>
				<ul class="mb-3 list-inside list-disc">
					{#each conflict.assignments as assignment (assignment.id)}
						<li>{assignment.serviceName} · {assignment.assignmentRole}</li>
					{/each}
				</ul>
				<form method="POST" action="?/changeRole">
					<input type="hidden" name="userId" value={conflict.userId} />
					<input type="hidden" name="role" value={conflict.role} />
					<input type="hidden" name="confirmRevoke" value="true" />
					<Button type="submit" variant="destructive" size="sm">
						Confirmar y revocar asignaciones
					</Button>
				</form>
			</AlertDescription>
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
							<form method="POST" action="?/changeRole" class="flex items-center gap-2">
								<input type="hidden" name="userId" value={user.id} />
								<select
									name="role"
									aria-label="Rol de {user.displayName}"
									class="h-8 rounded-lg border border-input bg-background px-2 text-sm"
									value={user.role}
								>
									<option value="technician">Técnico</option>
									<option value="supervisor">Supervisor</option>
									<option value="admin">Administrador</option>
								</select>
								<Button type="submit" variant="outline" size="sm">Cambiar rol</Button>
							</form>

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

							<DestructiveDelete
								label="Eliminar"
								endpoint={`/api/users/${user.id}`}
								itemName={user.displayName}
								description="Se elimina la cuenta; su nombre se conserva como firma en el historial (entregas, revisiones y fotos)."
							/>
						</div>
					</Card.Content>

					<Card.Footer>
						<details class="w-full">
							<summary class="cursor-pointer text-sm text-muted-foreground">
								Restablecer contraseña
							</summary>
							<form
								method="POST"
								action="?/resetPassword"
								class="mt-2 flex flex-wrap items-end gap-2"
							>
								<input type="hidden" name="userId" value={user.id} />
								<div class="space-y-1">
									<Label for="pw-{user.id}">Nueva contraseña</Label>
									<Input
										id="pw-{user.id}"
										name="password"
										type="password"
										autocomplete="new-password"
										required
									/>
								</div>
								<Button type="submit" variant="outline" size="sm">Restablecer</Button>
							</form>
						</details>
					</Card.Footer>
				</Card.Root>
			</li>
		{/each}
	</ul>
</div>
