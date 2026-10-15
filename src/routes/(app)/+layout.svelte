<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Bell from '@lucide/svelte/icons/bell';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import Download from '@lucide/svelte/icons/download';
	import Flame from '@lucide/svelte/icons/flame';
	import House from '@lucide/svelte/icons/house';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import Tags from '@lucide/svelte/icons/tags';
	import Users from '@lucide/svelte/icons/users';
	import * as Sidebar from '#lib/components/ui/sidebar';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import BottomNav from '#lib/components/app/bottom-nav.svelte';
	import { Avatar, AvatarFallback } from '#lib/components/ui/avatar';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let logoutForm = $state<HTMLFormElement | null>(null);

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

	const initials = $derived(
		data.user.displayName
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('')
	);

	function isCurrent(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	/**
	 * Ancho del área de contenido según la plantilla de la página: los listados,
	 * el tablero y la búsqueda usan todo el espacio; las fichas quedan algo más
	 * contenidas. En móvil no cambia nada (siempre fluido).
	 */
	const shellWidth = $derived.by(() => {
		const path = page.url.pathname;
		const wide =
			/^\/(dashboard|search|notifications|reviews)(\/|$)|\/admin\/(services|users|catalogs)$/.test(
				path
			);
		return wide ? 'max-w-[1600px]' : 'max-w-[1400px]';
	});

	/** En las pantallas de captura la acción principal es una barra fija, sin nav inferior. */
	const hideBottomNav = $derived(/^\/(works|elements)\//.test(page.url.pathname));

	const sections = $derived.by(() => {
		const general = [
			{ href: resolve('/(app)/dashboard'), label: 'Inicio', icon: House },
			{ href: resolve('/(app)/search'), label: 'Buscar', icon: Search },
			{ href: resolve('/(app)/notifications'), label: 'Notificaciones', icon: Bell }
		];
		if (data.user.role !== 'technician') {
			general.splice(2, 0, {
				href: resolve('/(app)/reviews'),
				label: 'Revisiones',
				icon: ClipboardCheck
			});
		}

		const list: { label: string; items: { href: string; label: string; icon: typeof House }[] }[] =
			[{ label: 'General', items: general }];

		if (data.user.role === 'admin') {
			list.push({
				label: 'Administración',
				items: [
					{ href: resolve('/(app)/admin/services'), label: 'Servicios', icon: Building2 },
					{ href: resolve('/(app)/admin/users'), label: 'Usuarios', icon: Users },
					{ href: resolve('/(app)/admin/catalogs'), label: 'Catálogos', icon: Tags }
				]
			});
		}

		return list.map((section) => ({
			...section,
			items: section.items.map((item) => ({ ...item, current: isCurrent(item.href) }))
		}));
	});
</script>

<Sidebar.Provider>
	<Sidebar.Root collapsible="icon">
		<Sidebar.Header>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent="Lumen">
						{#snippet child({ props })}
							<a href={resolve('/(app)/dashboard')} {...props}>
								<div
									class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
								>
									<Flame class="size-4" aria-hidden="true" />
								</div>
								<div class="grid flex-1 text-left text-sm leading-tight">
									<span class="truncate font-medium">Lumen</span>
									<span class="truncate text-xs text-muted-foreground"
										>{roleLabel[data.user.role]}</span
									>
								</div>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Header>

		<Sidebar.Content>
			{#each sections as section (section.label)}
				<Sidebar.Group>
					<Sidebar.GroupLabel>{section.label}</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each section.items as item (item.href)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={item.current} tooltipContent={item.label}>
										{#snippet child({ props })}
											<!-- eslint-disable svelte/no-navigation-without-resolve -->
											<a
												href={item.href}
												aria-current={item.current ? 'page' : undefined}
												{...props}
											>
												<item.icon aria-hidden="true" />
												<span>{item.label}</span>
											</a>
											<!-- eslint-enable svelte/no-navigation-without-resolve -->
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
							{#if section.label === 'Administración'}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton tooltipContent="Exportar CSV">
										{#snippet child({ props })}
											<!-- eslint-disable svelte/no-navigation-without-resolve -->
											<a href="/api/admin/exports/services.csv" {...props}>
												<Download aria-hidden="true" />
												<span>Exportar CSV</span>
											</a>
											<!-- eslint-enable svelte/no-navigation-without-resolve -->
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/if}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			{/each}
		</Sidebar.Content>

		<Sidebar.Footer>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									class="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-sidebar-accent"
								>
									<Avatar class="size-8 rounded-lg">
										<AvatarFallback class="rounded-lg">{initials}</AvatarFallback>
									</Avatar>
									<div class="grid flex-1 text-left text-sm leading-tight">
										<span class="truncate font-medium">{data.user.displayName}</span>
										<span class="truncate text-xs text-muted-foreground">{data.user.username}</span>
									</div>
								</button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content side="top" align="start" class="w-56">
							<DropdownMenu.Label>{roleLabel[data.user.role]}</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a href={resolve('/(app)/settings')} {...props}>
										<Settings />
										<span>Ajustes</span>
									</a>
								{/snippet}
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={() => logoutForm?.requestSubmit()}>
								<LogOut />
								<span>Cerrar sesión</span>
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Footer>

		<Sidebar.Rail />
	</Sidebar.Root>

	<Sidebar.Inset>
		<a
			href="#contenido"
			class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-1 focus:text-primary-foreground"
			>Saltar al contenido</a
		>
		<header
			class="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:min-h-16 lg:px-8"
		>
			<div class="max-md:hidden">
				<Sidebar.Trigger />
			</div>
			<form
				method="GET"
				action={resolve('/(app)/search')}
				class="hidden w-full max-w-xs md:block lg:max-w-md"
			>
				<label class="sr-only" for="global-search">Buscar servicios, trabajos y elementos</label>
				<input
					id="global-search"
					type="search"
					name="q"
					placeholder="Buscar servicios, trabajos y elementos…"
					aria-label="Buscar servicios, trabajos y elementos"
					class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
				/>
			</form>
			<div class="ml-auto flex items-center gap-1">
				<a
					href={resolve('/(app)/search')}
					class="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
					aria-label="Buscar"
				>
					<Search size={18} aria-hidden="true" />
				</a>
				<a
					href={resolve('/(app)/notifications')}
					class="relative flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:size-9"
					aria-label={data.unreadCount > 0
						? `Notificaciones: ${data.unreadCount} sin leer`
						: 'Notificaciones'}
				>
					<Bell size={18} aria-hidden="true" />
					{#if data.unreadCount > 0}
						<span
							class="tnum absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
							>{data.unreadCount > 99 ? '99+' : data.unreadCount}</span
						>
					{/if}
				</a>
				<Badge variant="secondary" class="hidden sm:inline">{roleLabel[data.user.role]}</Badge>
				<Button href={resolve('/(app)/settings')} variant="ghost" size="sm" class="hidden sm:inline"
					>Ajustes</Button
				>
			</div>
		</header>

		<main
			id="contenido"
			class="mx-auto w-full {shellWidth} px-4 pt-6 pb-28 md:pb-8 lg:px-8 lg:pt-8"
		>
			{@render children()}
		</main>
	</Sidebar.Inset>

	{#if !hideBottomNav}
		<BottomNav role={data.user.role} />
	{/if}
</Sidebar.Provider>

<form bind:this={logoutForm} method="POST" action="/logout" class="hidden"></form>
