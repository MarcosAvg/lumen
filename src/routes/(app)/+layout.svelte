<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { afterNavigate, invalidate, invalidateAll } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import Bell from '@lucide/svelte/icons/bell';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Sun from '@lucide/svelte/icons/sun';
	import House from '@lucide/svelte/icons/house';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Tags from '@lucide/svelte/icons/tags';
	import Users from '@lucide/svelte/icons/users';
	import * as Sidebar from '#lib/components/ui/sidebar';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import BottomNav from '#lib/components/app/bottom-nav.svelte';
	import InstallPrompt from '#lib/components/app/install-prompt.svelte';
	import { Avatar, AvatarFallback } from '#lib/components/ui/avatar';
	import { isEvidencePage, LIVE_REFRESH_MS } from '#lib/live-refresh';
	import { clearOfflineSnapshot, saveOfflineSnapshot } from '#lib/offline/snapshot';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let logoutForm = $state<HTMLFormElement | null>(null);

	// Refresco periódico de la vista y los contadores (polling, sin WebSockets).
	// En las fichas de evidencia solo se refrescan los badges para no interferir
	// con subidas u ordenaciones en curso.
	let lastRefresh = 0;

	function canRefresh(): boolean {
		return document.visibilityState === 'visible' && navigator.onLine;
	}

	function refresh() {
		if (!canRefresh()) return;
		const now = Date.now();
		if (now - lastRefresh < 1_000) return; // focus + visibilitychange a la vez
		lastRefresh = now;

		if (isEvidencePage(page.url.pathname)) {
			void invalidate('app:counts');
		} else {
			void invalidateAll();
		}
	}

	onMount(() => {
		// El service worker es necesario para Web Push y para el modo consulta.
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {});
		}

		// Snapshot de solo lectura para técnicos y supervisores. El admin no
		// dispone de modo offline en esta fase.
		const syncOfflineSnapshot = () => {
			if (data.user.role === 'admin') {
				void clearOfflineSnapshot();
				return;
			}
			if (!navigator.onLine) return;
			void fetch('/api/offline/snapshot', { headers: { accept: 'application/json' } })
				.then(async (response) => {
					if (response.status === 401 || response.status === 403) {
						await clearOfflineSnapshot();
						return;
					}
					if (!response.ok) throw new Error('Snapshot no disponible.');
					await saveOfflineSnapshot(data.user.id, await response.json());
				})
				.catch(() => {
					// Sin snapshot la app sigue funcionando online.
				});
		};

		void syncOfflineSnapshot();

		const interval = setInterval(refresh, LIVE_REFRESH_MS);
		document.addEventListener('visibilitychange', refresh);
		window.addEventListener('focus', refresh);
		window.addEventListener('online', syncOfflineSnapshot);

		return () => {
			clearInterval(interval);
			document.removeEventListener('visibilitychange', refresh);
			window.removeEventListener('focus', refresh);
			window.removeEventListener('online', syncOfflineSnapshot);
		};
	});

	// Tras navegar, lleva el foco al contenido para que los lectores de pantalla
	// (especialmente en móvil) anuncien la nueva vista sin desplazar la página.
	afterNavigate((navigation) => {
		if (navigation.type === 'enter') return;
		document.getElementById('contenido')?.focus({ preventScroll: true });
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

	const isSearchPage = $derived(page.url.pathname === '/search');

	// Padre al que vuelve el botón de la cabecera (lo declara cada ficha).
	const back = $derived(
		(page.data as unknown as { back?: { href: string; label: string } }).back ?? null
	);

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

	const sections = $derived.by(() => {
		const general = [
			{ href: resolve('/(app)/dashboard'), label: 'Inicio', icon: House, badge: 0 },
			{
				href: resolve('/(app)/notifications'),
				label: 'Notificaciones',
				icon: Bell,
				badge: data.unreadCount
			}
		];
		if (data.user.role !== 'technician') {
			general.splice(1, 0, {
				href: resolve('/(app)/reviews'),
				label: 'Revisiones',
				icon: ClipboardCheck,
				badge: data.reviewsCount
			});
		}
		if (data.user.role === 'supervisor') {
			general.splice(2, 0, {
				href: resolve('/(app)/contracts'),
				label: 'Contratos',
				icon: ShieldCheck,
				badge: 0
			});
		}
		if (data.user.role !== 'admin') {
			general.splice(data.user.role === 'supervisor' ? 3 : 1, 0, {
				href: resolve('/(app)/services'),
				label: 'Servicios',
				icon: Building2,
				badge: 0
			});
		}

		const list: {
			label: string;
			items: { href: string; label: string; icon: typeof House; badge: number }[];
		}[] = [{ label: 'General', items: general }];

		if (data.user.role === 'admin') {
			list.push({
				label: 'Administración',
				items: [
					{ href: resolve('/(app)/contracts'), label: 'Contratos', icon: ShieldCheck, badge: 0 },
					{ href: resolve('/(app)/admin/services'), label: 'Servicios', icon: Building2, badge: 0 },
					{ href: resolve('/(app)/admin/users'), label: 'Usuarios', icon: Users, badge: 0 },
					{ href: resolve('/(app)/admin/catalogs'), label: 'Catálogos', icon: Tags, badge: 0 }
				]
			});
		}

		return list.map((section) => ({
			...section,
			items: section.items.map((item) => ({ ...item, current: isCurrent(item.href) }))
		}));
	});
</script>

<a
	href="#contenido"
	data-slot="skip-link"
	class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-1 focus:text-primary-foreground"
	>Saltar al contenido</a
>

<Sidebar.Provider>
	{#if navigating.to}
		<div
			class="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/20"
			role="status"
			aria-live="polite"
			aria-label="Cargando"
		>
			<div class="animate-progress h-full w-1/3 bg-primary"></div>
		</div>
	{/if}
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
									<Sun class="size-4" aria-hidden="true" />
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
												{#if item.badge > 0}
													<span
														class="tnum ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
													>
														{item.badge > 99 ? '99+' : item.badge}
													</span>
												{/if}
											</a>
											<!-- eslint-enable svelte/no-navigation-without-resolve -->
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
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
						<DropdownMenu.Content side="top" align="start" class="w-72">
							<div class="flex items-center gap-2.5 rounded-lg px-2 py-2">
								<Avatar class="size-9 rounded-lg">
									<AvatarFallback class="rounded-lg">{initials}</AvatarFallback>
								</Avatar>
								<div class="grid min-w-0 flex-1 leading-tight">
									<span class="truncate text-sm font-medium">{data.user.displayName}</span>
									<span class="truncate text-xs text-muted-foreground">@{data.user.username}</span>
									<span class="text-[11px] text-muted-foreground">{roleLabel[data.user.role]}</span>
								</div>
							</div>
							<DropdownMenu.Separator />
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a href={resolve('/(app)/settings')} {...props}>
										<Settings />
										<span>Perfil y apariencia</span>
									</a>
								{/snippet}
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive" onSelect={() => logoutForm?.requestSubmit()}>
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

	<Sidebar.Inset class="min-w-0">
		<header
			data-slot="app-header"
			class="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:min-h-16 lg:px-8"
		>
			<div class="max-md:hidden">
				<Sidebar.Trigger />
			</div>
			{#if back}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={back.href}
					aria-label={`Volver a ${back.label}`}
					class="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:size-9"
				>
					<ArrowLeft size={18} aria-hidden="true" />
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
			{#if page.data.title}
				<h1
					id="page-title"
					class="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight md:text-2xl"
					title={page.data.title}
				>
					{page.data.title}
				</h1>
			{:else}
				<div class="flex-1"></div>
			{/if}
			{#if !isSearchPage}
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
						class="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
					/>
				</form>
			{/if}
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
			</div>
		</header>

		<div
			id="contenido"
			tabindex="-1"
			aria-busy={navigating.to !== null}
			class="mx-auto w-full min-w-0 {shellWidth} px-4 pt-6 pb-28 outline-none md:pb-8 lg:px-8 lg:pt-8"
		>
			<InstallPrompt />
			{@render children()}
		</div>
	</Sidebar.Inset>
	<BottomNav
		user={data.user}
		role={data.user.role}
		unreadCount={data.unreadCount}
		reviewsCount={data.reviewsCount}
	/>
</Sidebar.Provider>

<form
	bind:this={logoutForm}
	method="POST"
	action="/logout"
	class="hidden"
	onsubmit={(event) => {
		event.preventDefault();
		void clearOfflineSnapshot().finally(() => logoutForm?.submit());
	}}
></form>
