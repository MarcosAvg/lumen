<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import LogOut from '@lucide/svelte/icons/log-out';
	import X from '@lucide/svelte/icons/x';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Tags from '@lucide/svelte/icons/tags';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Users from '@lucide/svelte/icons/users';
	import { Avatar, AvatarFallback } from '#lib/components/ui/avatar';
	import { Button } from '#lib/components/ui/button';
	import * as Sheet from '#lib/components/ui/sheet';
	import type { SessionUser } from '#lib/types';

	let { user }: { user: SessionUser } = $props();

	let open = $state(false);

	const roleLabel = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	} as const;

	const initials = $derived(
		user.displayName
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('')
	);

	const secondaryItems = [
		{
			href: resolve('/(app)/contracts'),
			label: 'Contratos',
			description: 'Servicios y participantes',
			icon: ShieldCheck
		},
		{
			href: resolve('/(app)/admin/users'),
			label: 'Usuarios',
			description: 'Cuentas y roles',
			icon: Users
		},
		{
			href: resolve('/(app)/admin/catalogs'),
			label: 'Catálogos',
			description: 'Listas reutilizables',
			icon: Tags
		},
		{
			href: resolve('/(app)/settings'),
			label: 'Perfil',
			description: 'Cuenta y apariencia',
			icon: UserRound
		}
	];

	function isCurrent(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground active:text-foreground"
			>
				<Ellipsis class="size-6" aria-hidden="true" />
				<span>Más</span>
			</button>
		{/snippet}
	</Sheet.Trigger>
	<Sheet.Content
		side="bottom"
		showCloseButton={false}
		class="max-h-[88dvh] overflow-y-auto overscroll-contain p-0"
	>
		<div class="mx-auto mt-3 h-1 w-10 rounded-full bg-border"></div>
		<div class="flex items-start justify-between gap-3 px-5 pt-3 pb-4">
			<Sheet.Header class="gap-1 p-0">
				<Sheet.Title class="text-xl font-semibold tracking-tight">Más</Sheet.Title>
				<Sheet.Description>Administración y cuenta.</Sheet.Description>
			</Sheet.Header>
			<Sheet.Close>
				{#snippet child({ props })}
					<Button variant="ghost" size="icon-sm" {...props}>
						<X aria-hidden="true" />
						<span class="sr-only">Cerrar</span>
					</Button>
				{/snippet}
			</Sheet.Close>
		</div>

		<div class="mx-5 mb-5 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
			<Avatar class="size-10 rounded-lg">
				<AvatarFallback class="rounded-lg">{initials}</AvatarFallback>
			</Avatar>
			<div class="grid min-w-0 flex-1 leading-tight">
				<span class="truncate text-sm font-medium">{user.displayName}</span>
				<span class="truncate text-xs text-muted-foreground">@{user.username}</span>
				<span class="text-[11px] text-muted-foreground">{roleLabel[user.role]}</span>
			</div>
		</div>

		<p
			class="px-5 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
		>
			Administración
		</p>
		<div class="grid grid-cols-2 gap-2 px-5">
			{#each secondaryItems as item (item.href)}
				{@const current = isCurrent(item.href)}
				<a
					href={item.href}
					aria-current={current ? 'page' : undefined}
					class="relative flex min-h-24 flex-col justify-between gap-3 rounded-xl border border-border bg-card p-3 transition-colors active:bg-muted/50"
					onclick={() => (open = false)}
				>
					{#if current}
						<span class="absolute inset-y-3 left-0 w-0.5 rounded-full bg-teal" aria-hidden="true"
						></span>
					{/if}
					<span class="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
						<item.icon class="size-4" aria-hidden="true" />
					</span>
					<span class="space-y-0.5">
						<span class="block text-sm font-semibold">{item.label}</span>
						<span class="block text-[11px] leading-snug text-muted-foreground">
							{item.description}
						</span>
					</span>
				</a>
			{/each}
		</div>

		<div class="px-5 pt-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
			<form method="POST" action="/logout">
				<Button type="submit" variant="destructive" class="w-full justify-start">
					<LogOut aria-hidden="true" />
					Cerrar sesión
				</Button>
			</form>
		</div>
	</Sheet.Content>
</Sheet.Root>
