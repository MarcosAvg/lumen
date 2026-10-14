<script lang="ts">
	import * as Card from '#lib/components/ui/card';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head>
	<title>Configurar Lumen</title>
</svelte:head>

<main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
	<header class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight">Configurar Lumen</h1>
		<p class="text-sm text-muted-foreground">
			Crea la primera cuenta de administración. Este paso solo está disponible una vez.
		</p>
	</header>

	{#if form?.message}
		<Alert variant="destructive">
			<AlertDescription>{form.message}</AlertDescription>
		</Alert>
	{/if}

	<Card.Root>
		<Card.Content class="pt-6">
			<form method="POST" class="space-y-4">
				<div class="space-y-2">
					<Label for="displayName">Nombre visible</Label>
					<Input id="displayName" name="displayName" autocomplete="name" required />
					{#if form?.errors?.displayName}
						<p class="text-sm text-destructive">{form.errors.displayName}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="username">Usuario</Label>
					<Input id="username" name="username" autocomplete="username" required />
					{#if form?.errors?.username}
						<p class="text-sm text-destructive">{form.errors.username}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="password">Contraseña</Label>
					<Input
						id="password"
						name="password"
						type="password"
						autocomplete="new-password"
						required
					/>
					{#if form?.errors?.password}
						<p class="text-sm text-destructive">{form.errors.password}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="confirmPassword">Repetir contraseña</Label>
					<Input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						autocomplete="new-password"
						required
					/>
					{#if form?.errors?.confirmPassword}
						<p class="text-sm text-destructive">{form.errors.confirmPassword}</p>
					{/if}
				</div>

				<Button type="submit" class="w-full">Crear administrador</Button>
			</form>
		</Card.Content>
	</Card.Root>
</main>
