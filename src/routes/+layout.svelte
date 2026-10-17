<script lang="ts">
	import './layout.css';
	import OfflineBanner from '#lib/components/offline-banner.svelte';
	import { Toaster } from '#lib/components/ui/sonner';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<OfflineBanner />
{@render children()}
<Toaster />
