<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const roleLabel = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	} as const;

	const items = $derived(
		data.user.role === 'admin'
			? [
					{ href: resolve('/(app)/dashboard'), label: 'Inicio' },
					{ href: resolve('/(app)/admin/users'), label: 'Usuarios' },
					{ href: resolve('/(app)/admin/services'), label: 'Servicios' }
				]
			: [{ href: resolve('/(app)/dashboard'), label: 'Inicio' }]
	);

	const nav = $derived(
		items.map((item) => ({ ...item, current: page.url.pathname === item.href }))
	);
</script>

<div class="min-h-dvh bg-background">
	<header class="border-b">
		<div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
			<a href={resolve('/(app)/dashboard')} class="text-lg font-semibold tracking-tight">Lumen</a>

			<nav class="flex flex-1 items-center gap-1" aria-label="Navegación principal">
				{#each nav as item (item.href)}
					<a
						href={item.href}
						aria-current={item.current ? 'page' : undefined}
						class="rounded-md px-3 py-1.5 text-sm hover:bg-muted {item.current
							? 'bg-muted font-medium'
							: 'text-muted-foreground'}"
					>
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="flex items-center gap-3">
				<span class="hidden text-sm text-muted-foreground sm:inline">{data.user.displayName}</span>
				<Badge variant="secondary">{roleLabel[data.user.role]}</Badge>
				<form method="POST" action="/logout">
					<Button type="submit" variant="outline" size="sm">Salir</Button>
				</form>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-4 py-6">
		{@render children()}
	</main>
</div>
