<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import OfflineBanner from '#lib/components/offline-banner.svelte';
	import { Toaster } from '#lib/components/ui/sonner';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<OfflineBanner />
{@render children()}
<Toaster />
