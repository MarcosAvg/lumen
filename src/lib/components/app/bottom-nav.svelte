<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Bell from '@lucide/svelte/icons/bell';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import House from '@lucide/svelte/icons/house';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import UserRound from '@lucide/svelte/icons/user-round';
	import { useSidebar } from '#lib/components/ui/sidebar';
	import type { Role } from '#lib/types';

	/** Barra de navegación inferior (solo móvil), pensada para el pulgar. */
	let {
		role,
		unreadCount = 0,
		reviewsCount = 0
	}: { role: Role; unreadCount?: number; reviewsCount?: number } = $props();

	const sidebar = useSidebar();

	type Item = {
		key: string;
		label: string;
		icon: typeof House;
		href?: string;
		more?: boolean;
		badge?: number;
	};

	const items = $derived.by<Item[]>(() => {
		const home = {
			key: 'home',
			label: 'Inicio',
			icon: House,
			href: resolve('/(app)/dashboard')
		};
		const services = {
			key: 'services',
			label: 'Servicios',
			icon: Building2,
			href: resolve('/(app)/services')
		};
		const notifications = {
			key: 'notifications',
			label: 'Avisos',
			icon: Bell,
			href: resolve('/(app)/notifications'),
			badge: unreadCount
		};
		const reviews = {
			key: 'reviews',
			label: 'Revisiones',
			icon: ClipboardCheck,
			href: resolve('/(app)/reviews'),
			badge: reviewsCount
		};
		const profile = {
			key: 'profile',
			label: 'Perfil',
			icon: UserRound,
			href: resolve('/(app)/settings')
		};
		const contracts = {
			key: 'contracts',
			label: 'Contratos',
			icon: ShieldCheck,
			href: resolve('/(app)/contracts')
		};

		if (role === 'technician') return [home, services, notifications, profile];
		if (role === 'supervisor') return [home, reviews, contracts, notifications, profile];
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
						aria-label={(item.badge ?? 0) > 0 ? `${item.label}: ${item.badge}` : undefined}
						class="relative flex w-full flex-col items-center gap-0.5 py-2 text-[11px] {current
							? 'font-medium text-foreground'
							: 'text-muted-foreground'}"
					>
						{#if current}
							<span
								class="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary"
								aria-hidden="true"
							></span>
						{/if}
						<span class="relative">
							<item.icon class="size-6" aria-hidden="true" />
							{#if (item.badge ?? 0) > 0}
								<span
									class="tnum absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
									>{(item.badge ?? 0) > 99 ? '99+' : item.badge}</span
								>
							{/if}
						</span>
						<span>{item.label}</span>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
			</li>
		{/each}
	</ul>
</nav>
