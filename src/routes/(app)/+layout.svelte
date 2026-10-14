<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Bell from '@lucide/svelte/icons/bell';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	onMount(() => {
		// El service worker es necesario para Web Push (notificaciones).
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {});
		}
	});

	const roleLabel = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	} as const;

	const items = $derived.by(() => {
		const base = [{ href: resolve('/(app)/dashboard'), label: 'Inicio' }];
		if (data.user.role === 'technician') return base;
		const reviews = [{ href: resolve('/(app)/reviews'), label: 'Revisiones' }];
		if (data.user.role === 'supervisor') return [...base, ...reviews];
		return [
			...base,
			...reviews,
			{ href: resolve('/(app)/admin/users'), label: 'Usuarios' },
			{ href: resolve('/(app)/admin/services'), label: 'Servicios' },
			{ href: resolve('/(app)/admin/catalogs'), label: 'Catálogos' }
		];
	});

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

			<form
				method="GET"
				action={resolve('/(app)/search')}
				class="order-last w-full sm:order-none sm:w-auto"
			>
				<input
					type="search"
					name="q"
					placeholder="Buscar…"
					aria-label="Buscar servicios, trabajos y elementos"
					class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-44"
				/>
			</form>

			<div class="flex items-center gap-3">
				<a
					href={resolve('/(app)/notifications')}
					class="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
					aria-label={data.unreadCount > 0
						? `Notificaciones: ${data.unreadCount} sin leer`
						: 'Notificaciones'}
				>
					<Bell size={18} aria-hidden="true" />
					{#if data.unreadCount > 0}
						<span
							class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
							>{data.unreadCount > 99 ? '99+' : data.unreadCount}</span
						>
					{/if}
				</a>
				<a
					href={resolve('/(app)/settings')}
					class="hidden text-sm text-muted-foreground hover:underline sm:inline">Ajustes</a
				>
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
