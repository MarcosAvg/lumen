<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Bell from '@lucide/svelte/icons/bell';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import House from '@lucide/svelte/icons/house';
	import Search from '@lucide/svelte/icons/search';
	import UserRound from '@lucide/svelte/icons/user-round';
	import { useSidebar } from '#lib/components/ui/sidebar';
	import type { Role } from '#lib/types';

	/** Barra de navegación inferior (solo móvil), pensada para el pulgar. */
	let { role }: { role: Role } = $props();

	const sidebar = useSidebar();

	type Item = { key: string; label: string; icon: typeof House; href?: string; more?: boolean };

	const items = $derived.by<Item[]>(() => {
		const home = {
			key: 'home',
			label: 'Inicio',
			icon: House,
			href: resolve('/(app)/dashboard')
		};
		const search = {
			key: 'search',
			label: 'Buscar',
			icon: Search,
			href: resolve('/(app)/search')
		};
		const notifications = {
			key: 'notifications',
			label: 'Avisos',
			icon: Bell,
			href: resolve('/(app)/notifications')
		};
		const reviews = {
			key: 'reviews',
			label: 'Revisiones',
			icon: ClipboardCheck,
			href: resolve('/(app)/reviews')
		};
		const profile = {
			key: 'profile',
			label: 'Perfil',
			icon: UserRound,
			href: resolve('/(app)/settings')
		};

		if (role === 'technician') return [home, search, notifications, profile];
		if (role === 'supervisor') return [home, reviews, search, notifications, profile];
		return [
			home,
			{
				key: 'services',
				label: 'Servicios',
				icon: Building2,
				href: resolve('/(app)/admin/services')
			},
			reviews,
			notifications,
			{ key: 'more', label: 'Más', icon: Ellipsis, more: true }
		];
	});

	function isCurrent(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	const columns = $derived(items.length);
</script>

<nav
	aria-label="Navegación principal"
	class="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
>
	<ul class="grid" style="grid-template-columns: repeat({columns}, minmax(0, 1fr))">
		{#each items as item (item.key)}
			<li>
				{#if item.more}
					<button
						type="button"
						class="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground active:text-foreground"
						onclick={() => sidebar.setOpenMobile(true)}
					>
						<item.icon class="size-6" aria-hidden="true" />
						<span>{item.label}</span>
					</button>
				{:else}
					{@const current = isCurrent(item.href as string)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={item.href}
						aria-current={current ? 'page' : undefined}
						class="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] {current
							? 'font-medium text-foreground'
							: 'text-muted-foreground'}"
					>
						<item.icon class="size-6" aria-hidden="true" />
						<span>{item.label}</span>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
			</li>
		{/each}
	</ul>
</nav>
